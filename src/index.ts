import path from 'path'
import fs from 'fs-extra'
import * as changeCase from 'change-case'
import consola from 'consola'
import { Config, ApiList, InterfaceType, ExtendedApi } from './types'
import fetchApiCollection from './fetchApiCollection'
import generateRequestPayloadType from './generateRequestPayloadType'
import generateResponsePayloadType from './generateResponsePayloadType'

export default async (config: Config): Promise<void> => {
  consola.info('获取接口 JSON 文件中...')
  const apiCollection = await fetchApiCollection(config)
  consola.info('生成 TypeScript 类型文件中...')
  const categoryIdToApiList = apiCollection.reduce((res, api) => {
    if (api.list.length) {
      res[api.list[0].catid] = api.list
    }
    return res
  }, {} as { [key: number]: ApiList })
  const tsContent = (
    await Promise.all(
      Object.keys(config.categories).map(async (categoryId: any) => {
        const { getRequestFunctionName, getInterfaceName } = config.categories[categoryId]
        return Promise.all(
          categoryIdToApiList[categoryId].map(async api => {
            const extendedApi: ExtendedApi = {
              ...api,
              parsedPath: path.parse(api.path),
              changeCase: changeCase,
            }
            const requestDataInterfaceName = changeCase.pascalCase(getInterfaceName(extendedApi, InterfaceType.Request))
            const responseDataInterfaceName = changeCase.pascalCase(getInterfaceName(extendedApi, InterfaceType.Response))
            const requestPayloadType = (await generateRequestPayloadType(api, requestDataInterfaceName)).trim()
            const responsePayloadType = (await generateResponsePayloadType(api, responseDataInterfaceName, config.dataKey)).trim()
            return [
              `/**\n * **请求类型**：${api.title}\n */\n${requestPayloadType}`,
              `/**\n * **响应类型**：${api.title}\n */\n${responsePayloadType}`,
              `/**\n * ${api.title}\n */\nexport function ${getRequestFunctionName(extendedApi)}(data${/(\{\}|any)$/s.test(requestPayloadType) ? '?' : ''}: ${requestDataInterfaceName}): Promise<${responseDataInterfaceName}> {\n${
                [
                  `  return request({`,
                  `    path: '${api.path}',`,
                  `    method: '${api.method}',`,
                  `    requestBodyType: '${api.req_body_type}',`,
                  `    responseBodyType: '${api.res_body_type}',`,
                  `    data: data`,
                  `  } as any)`,
                ].join('\n')
              }\n}`,
            ].join('\n\n')
          })
        )
      })
    )
  )
    .reduce((res, arr) => {
      res.push(...arr)
      return res
    }, [])
    .join('\n\n')
  fs.outputFileSync(path.resolve(process.cwd(), config.targetFile), [
    `/* tslint:disable */\n/* eslint-disable */`,
    `import request from './request'`,
    `import { FileData } from 'yapi-to-typescript/lib/utils'`,
    tsContent,
  ].join('\n\n'))
  consola.success(`操作完成.`)
}
