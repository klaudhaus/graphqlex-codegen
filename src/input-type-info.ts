import {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInputType, GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLSchema
} from "graphql"
import { InputFieldInfo, InputTypeInfoMap } from "graphqlex"

/**
 * Obtain the InputTypeInfoMap used by graphqlex to trim operation inputs.
 */
export const getInputTypeInfoMap = (schema: GraphQLSchema): InputTypeInfoMap => {
  const result: InputTypeInfoMap = {}

  const getInputFieldInfo = (
    name: string,
    schemaFieldType: GraphQLInputType,
    isList: boolean = false,
    isNonNull: boolean = false
  ): InputFieldInfo => {
    if (schemaFieldType instanceof GraphQLScalarType ||
      schemaFieldType instanceof GraphQLEnumType ||
      schemaFieldType instanceof GraphQLInputObjectType
    ) {
      return { name, typeName: schemaFieldType.name, isList, isNonNull }
    } else if (schemaFieldType instanceof GraphQLNonNull) {
      return getInputFieldInfo(name, schemaFieldType.ofType, isList, true)
    } else if (schemaFieldType instanceof GraphQLList) {
      return getInputFieldInfo(name, schemaFieldType.ofType, true, isNonNull)
    } else {
      throw new Error(`GraphQL Code Generation error - input field name ${name} has an unknown type`)
    }
  }

  const schemaTypeMap = schema.getTypeMap()
  for (const typeName in schemaTypeMap) {
    const schemaType = schemaTypeMap[typeName]
    if (schemaType instanceof GraphQLInputObjectType) {
      const name = schemaType.name
      const fields: InputFieldInfo[] = []
      const schemaFieldMap = schemaType.getFields()
      for (const fieldName in schemaFieldMap) {
        const schemaField = schemaFieldMap[fieldName]
        fields.push(getInputFieldInfo(schemaField.name, schemaField.type))
      }
      result[name] = { name, fields }
    }
  }
  return result
}
