type VariableInfo = {
  name: string
  typeName: string
  isList: boolean
}

export const getVariableInfo = (varDef: any, name: string = "", isList: boolean = false): VariableInfo => {
  if (varDef.kind === "VariableDefinition") {
    return getVariableInfo(varDef.type, varDef.variable?.name?.value, isList)
  } else if (varDef.kind === "ListType") {
    return getVariableInfo(varDef.type, name, true)
  } else if (varDef.kind === "NamedType") {
    return { name, typeName: varDef.name?.value, isList }
  } else {
    // Keep drilling down
    return getVariableInfo(varDef.type, name, isList)
  }
}
