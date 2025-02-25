import dedent from "ts-dedent"
import { InputTypeInfoMap } from "graphqlex"
import { VariableDefinitionNode } from "graphql/language"
import { getVariableInfo } from "./variable-type-info"
import { OperationTypeNode } from "graphql"

export const getImportsBlock = (typeImports: string[]) => {
  // Deduplicate and convert scalar members to Scalars
  const typeSet = new Set(typeImports.map(i =>
    scalarsMap[i as keyof typeof scalarsMap] ? "Scalars" : i
  ))
  typeImports = [...typeSet]
  return dedent`
    /* eslint-disable */
    import { Api, ApiOptions, GraphQLResponse, gql, trimInput, promoteResponseData } from "graphqlex"
    import {
      ${typeImports.sort().join(",\n")}
    } from "./graphql-types"
    
  `
}

export const setApiBlock = dedent`
  export let api: Api
  export function setApi (toApi: Api) { api = toApi }
  
  export function initApi (url: string, options?: ApiOptions) {
    return api = new Api(url, options)
  }
  
`

export const getInputTypeBlock = (inputTypeInfoMap: InputTypeInfoMap) => dedent`
  const inputTypeInfoMap = ${JSON.stringify(inputTypeInfoMap, null, 2)}
  
`

export const getTrimInputsBlock = (vars: readonly VariableDefinitionNode[]) => vars
  .map(v => getVariableInfo(v))
  .filter(v => vars.length === 1 || !["String", "Boolean", "Int", "Float"].includes(v.typeName))
  .map(varInfo => {
    if (varInfo.isList) {
      return dedent`
          if (Array.isArray(vars.${varInfo.name})) {
            vars.${varInfo.name} = vars.${varInfo.name}.map(item => trimInput(item, "${varInfo.typeName}", inputTypeInfoMap))
          }
        `
    } else {
      if (vars.length === 1) {
        return `if (${varInfo.name}) vars.${varInfo.name} = trimInput(${varInfo.name}, "${varInfo.typeName}", inputTypeInfoMap)`
      } else {
        return `if (vars.${varInfo.name}) vars.${varInfo.name} = trimInput(vars.${varInfo.name}, "${varInfo.typeName}", inputTypeInfoMap)`
      }
    }
  })
  .join("\n")

/**
 * Elements of the generated function.
 */
export type OperationFunctionInfo = {
  operationType: OperationTypeNode
  operationName: string
  functionName: string
  paramName?: string
  paramType?: string
  resultType?: string
  hasInputs?: boolean
  trimInputsBlock?: string
  gqlBlock?: string
  dataTransformBlock?: string
}

export const operationFunction = (info: OperationFunctionInfo): string => {
  const body = info.operationType === "subscription"
    ? subscriptionFunction(info)
    : queryMutationFunction(info)

  return body + "\n"
}

/**
 * Get the function for a single-execution operation
 */
export const queryMutationFunction = (info: OperationFunctionInfo): string => dedent`
  export async function ${info.functionName} (${info.paramName}: ${paramTypeAndDefault(info)}) {
    ${info.trimInputsBlock}
    
    const ${info.operationType} = gql\`
      ${info.gqlBlock}
    \`
    const response = await api.run(${info.operationType}${info.hasInputs ? ", vars" : ""})
    ${info.dataTransformBlock}
    return <GraphQLResponse<${resultTypeOrScalar(info)}>>response
  }

`

export const subscriptionFunction = (info: OperationFunctionInfo): string => dedent`
  export function ${info.functionName} (
      handler?: (data: ${info.resultType}) => any,
      ${info.paramName}: ${paramTypeAndDefault(info)}
    ) {
      ${info.trimInputsBlock}
      
      const subscription = gql\`
        ${info.gqlBlock}
      \`
      api.subscribe(subscription, vars).onData(handler)
    }

`

export const paramTypeAndDefault = (info: OperationFunctionInfo) => {
  const scalar = scalarsMap[info.paramType as keyof typeof scalarsMap]
  return scalar || `${info.paramType} = {} as ${info.paramType}`
}

export const resultTypeOrScalar = (info: OperationFunctionInfo) => {
  const scalar = scalarsMap[info.resultType as keyof typeof scalarsMap]
  return scalar || info.resultType
}

export const scalarsMap = {
  Int: "number",
  String: "string",
  Boolean: "boolean",
  Float: "number",
  ID: "string"
}
