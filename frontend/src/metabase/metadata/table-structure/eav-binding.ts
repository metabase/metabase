import { useMemo } from "react";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type {
  ConcreteTableId,
  Field,
  FieldId,
  Table,
} from "metabase-types/api";

import {
  type EavBinding,
  type EavDefinitionInference,
  findTargetTable,
  inferDefinitionColumns,
  inferEavDefinition,
} from "./inference";
import { isRoleA } from "./roles";
import { useTableStructures } from "./table-structure";
import { useSchemaTables, useTablesWithFields } from "./use-tables-with-fields";

export type EavDefinitionTable = Table & { id: ConcreteTableId };

export type ResolvedEavBinding = {
  binding: EavBinding;
  definitionInference: EavDefinitionInference;
  isDefinitionOverridden: boolean;
  isLabelOverridden: boolean;
  isTypeOverridden: boolean;
  entityTable: Table | undefined;
  entityKeyField: Field | undefined;
  propertyField: Field | undefined;
  definitionTable: EavDefinitionTable | undefined;
  definitionJoinFieldId: FieldId | null;
  definitionNameFieldId: FieldId | null;
  schemaTables: Table[];
  isLoading: boolean;
};

const fieldById = (fields: Field[], fieldId: FieldId | null) =>
  fieldId == null
    ? undefined
    : fields.find((field) => getRawTableFieldId(field) === fieldId);

const resolvePointer = (
  isOverridden: boolean,
  override: FieldId | null | undefined,
  inferred: FieldId | null,
) => (isOverridden ? (override ?? null) : inferred);

const isDefinitionTable = (
  table: Table | undefined,
): table is EavDefinitionTable => typeof table?.id === "number";

export function useEavBinding(table: Table): ResolvedEavBinding {
  const { getTableStructure } = useTableStructures();
  const { tables: schemaTables, isLoading } = useSchemaTables(table);
  const structure = getTableStructure(table);
  const { eav, eavOverrides } = structure;
  const fields = useMemo(() => table.fields ?? [], [table.fields]);

  return useMemo(() => {
    const definitionInference = inferEavDefinition(
      { name: table.name, fields },
      eav.propertyFieldId,
      schemaTables,
    );
    const isDefinitionOverridden = eavOverrides.definitionTableId !== undefined;
    const definitionTableId = isDefinitionOverridden
      ? (eavOverrides.definitionTableId ?? null)
      : definitionInference.definitionTableId;
    const matchingTable = schemaTables.find(
      ({ id }) => definitionTableId != null && id === definitionTableId,
    );
    const definitionTable = isDefinitionTable(matchingTable)
      ? matchingTable
      : undefined;
    const definitionFields = definitionTable?.fields ?? [];
    const columns = inferDefinitionColumns(definitionFields);
    const isLabelOverridden = eavOverrides.labelFieldId !== undefined;
    const isTypeOverridden = eavOverrides.typeFieldId !== undefined;
    const propertyField = fieldById(fields, eav.propertyFieldId);
    const entityKeyField = fieldById(fields, eav.entityKeyFieldId);
    const joinField = definitionFields.find(
      (field) => field.id === propertyField?.fk_target_field_id,
    );

    return {
      binding: {
        ...eav,
        definitionTableId: definitionTable?.id ?? null,
        labelFieldId: definitionTable
          ? resolvePointer(
              isLabelOverridden,
              eavOverrides.labelFieldId,
              columns.labelFieldId,
            )
          : null,
        typeFieldId: definitionTable
          ? resolvePointer(
              isTypeOverridden,
              eavOverrides.typeFieldId,
              columns.typeFieldId,
            )
          : null,
      },
      definitionInference,
      isDefinitionOverridden,
      isLabelOverridden,
      isTypeOverridden,
      entityTable: findTargetTable(entityKeyField, schemaTables),
      entityKeyField,
      propertyField,
      definitionTable,
      definitionJoinFieldId: joinField
        ? getRawTableFieldId(joinField)
        : columns.keyFieldId,
      definitionNameFieldId: columns.keyFieldId,
      schemaTables,
      isLoading,
    };
  }, [eav, eavOverrides, fields, isLoading, schemaTables, table.name]);
}

export function useCustomPropertyParents(
  tables: Table[],
): Map<Table["id"], Table> {
  const { getTableStructure } = useTableStructures();
  const { tables: tablesWithFields } = useTablesWithFields(tables, {
    isEnabled: tables.length > 0,
  });
  return useMemo(
    () =>
      new Map(
        tablesWithFields.flatMap((table) => {
          const { role, eav } = getTableStructure(table);
          if (!role || !isRoleA(role, "role/CustomPropertyTable")) {
            return [];
          }
          const entityKeyField = fieldById(
            table.fields ?? [],
            eav.entityKeyFieldId,
          );
          const parent = findTargetTable(entityKeyField, tablesWithFields);
          return parent ? [[table.id, parent]] : [];
        }),
      ),
    [getTableStructure, tablesWithFields],
  );
}
