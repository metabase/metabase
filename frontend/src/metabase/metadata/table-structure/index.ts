export {
  type CustomPropertyFacet,
  type EavBinding,
  type EavDefinitionInference,
  findTargetTable,
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
  useCustomPropertyParents,
  useEavBinding,
} from "./eav-binding";
export {
  type PivotModel,
  usePivotModel,
  usePivotModelById,
} from "./pivot-models";
export { getTableHiddenReason } from "./visibility";
export { type TableStructure, useTableStructures } from "./table-structure";
export {
  type BoundDefinitions,
  MISMATCH_HANDLINGS,
  type MismatchHandling,
  type EntityKeyValue,
  type PropertySampleRow,
  conformsToType,
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
  usePropertySampleRows,
  usePropertyRegistry,
} from "./property-registry";
