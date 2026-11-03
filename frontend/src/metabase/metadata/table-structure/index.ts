export {
  type CustomPropertyFacet,
  type EavBinding,
  type EavDefinitionInference,
  inferCustomPropertyFacet,
  inferDefinitionColumns,
  inferWildcardDefinitionTable,
  type MainDateInference,
  type HistoryBinding,
  PERIOD_GRANULARITIES,
  type PeriodGranularity,
  type RoleInference,
  type RowIdentity,
} from "./inference";
export {
  getPeriodGranularityLabel,
  getPeriodGranularityOptions,
  getRowIdentityLabel,
} from "./labels";
export {
  type TableRole,
  getTableRoleLabel,
  getTableRoleOptions,
  getTableRoleRowDescription,
  isRoleA,
  isTableRole,
} from "./roles";
export {
  useSchemaTables,
  useTableFields,
  useTablesWithFields,
} from "./use-tables-with-fields";
export {
  type EavDefinitionTable,
  type ResolvedEavBinding,
  useEavBinding,
} from "./eav-binding";
export { type PivotModel, usePivotModel } from "./pivot-models";
export { getTableHiddenReason } from "./visibility";
export { type TableStructure, useTableStructures } from "./table-structure";
export {
  type BoundDefinitions,
  PROPERTY_SEMANTIC_TYPES,
  PROPERTY_TYPES,
  type PropertyRegistry,
  type PropertyRegistryState,
  type PropertySemanticType,
  type PropertyDefinition,
  type PropertySignal,
  type PropertySource,
  type PropertyType,
  type RegistryProperty,
  getPropertyBaseType,
  readDeclaredType,
  useDefinitionRows,
  usePropertyOverrides,
  usePropertyRegistry,
} from "./property-registry";
