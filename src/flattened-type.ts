import {
  GraphQLEnumType, GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType, GraphQLType,
  GraphQLUnionType
} from "graphql"

export const GraphQLTypes = {
  OBJECT: GraphQLObjectType,
  SCALAR: GraphQLScalarType,
  INTERFACE: GraphQLInterfaceType,
  UNION: GraphQLUnionType,
  ENUM: GraphQLEnumType,
  INPUT: GraphQLInputObjectType
}

export type GraphQLTypeUnion =
  GraphQLObjectType |
  GraphQLScalarType |
  GraphQLInterfaceType |
  GraphQLUnionType |
  GraphQLEnumType |
  GraphQLInputObjectType

/**
 * GraphQLSchema contains field type information in a nested format that is inconvenient for many processes.
 * This class represents these field types in a flattened structure, with references to the original inner type.
 */
export class FlattenedType {
  type: GraphQLType
  isNonNull: boolean
  isList: boolean
  isListNonNull: boolean
  isSimple: boolean
  name: string
  gqlType: GraphQLTypeUnion

  /**
   * Construct a TypeInfo object for the given type
   *
   * The options object contains values intended for recursive internal use:
   *
   * `isNonNull` for non-nullable types
   * `isList` for list types
   * `isListNonNull` for non-null list types
   *
   * @param type { GraphQLType } The type to be represented
   * @param options { { isNonNull?: boolean, isList?: boolean, isListNonNull?: boolean } }
   */
  constructor (type: GraphQLType, {
    isNonNull = false, isList = false, isListNonNull = false
  }: Partial<FlattenedType> = {}) {
    if (type instanceof GraphQLList) {
      return new FlattenedType(type.ofType, { isList: true, isListNonNull })
    } else if (type instanceof GraphQLNonNull) {
      return new FlattenedType(type.ofType, { isNonNull: true, isList })
    } else {
      this.type = type
      this.isNonNull = isNonNull
      this.isList = isList
      this.isListNonNull = isListNonNull
      this.name = type.name
      // Assign gqlType for determining general GraphQL type of field (scalar / object / enum etc.)
      for (const value of Object.values(GraphQLTypes)) {
        if (type instanceof value) {
          this.gqlType = <unknown>value as GraphQLTypeUnion
        }
      }
      this.isSimple =
        this.gqlType instanceof GraphQLScalarType ||
        this.gqlType instanceof GraphQLEnumType
    }
  }

  /**
   * Return the equivalent TypeScript type name.
   */
  get typeScriptName () {
    return this.name + (this.isList ? "[]" : "")
  }
}
