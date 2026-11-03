export {
  type EavBinding,
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
export { useTableFields, useTablesWithFields } from "./use-tables-with-fields";
export { getTableHiddenReason } from "./visibility";
export { type TableStructure, useTableStructures } from "./table-structure";
export {
  PROPERTY_SEMANTIC_TYPES,
  PROPERTY_TYPES,
  type PropertyRegistry,
  type PropertyRegistryState,
  type PropertySemanticType,
  type PropertySignal,
  type PropertyType,
  type RegistryProperty,
  getPropertyBaseType,
  usePropertyOverrides,
  usePropertyRegistry,
} from "./property-registry";
