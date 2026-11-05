import { useCallback, useMemo } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import {
  useSchemaTables,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type FieldTypeInference,
  inferTableFieldTypes,
} from "./field-inference";
import {
  FACET_KEYS,
  type FacetKey,
  type Facets,
  isFieldTypeA,
} from "./field-types";
import { getSuggestions } from "./review";
import {
  type RowNouns,
  type SubjectInference,
  getRowNouns,
  inferTableSubject,
} from "./subject-inference";
import {
  NO_SUBJECT,
  type TableSubject,
  isSubjectA,
  isTableSubject,
} from "./subjects";

export type SemanticTable = Pick<
  Table,
  "db_id" | "id" | "name" | "display_name" | "entity_type" | "schema"
> & { fields?: Field[] };

type TableOverrides = {
  subject?: TableSubject;
  singular?: string;
  plural?: string;
};

export type FieldTypeValue = {
  semanticType: string | null;
  facets: Facets;
};

type SemanticTypesState = {
  tables: Record<string, TableOverrides>;
  fields: Record<string, FieldTypeValue>;
};

export type ResolvedSubject = {
  subject: TableSubject | null;
  inference: SubjectInference;
  isOverridden: boolean;
  hasSuggestion: boolean;
  needsReview: boolean;
  rowNouns: RowNouns;
  defaultRowNouns: RowNouns;
};

export type ResolvedFieldType = FieldTypeValue & {
  inference: FieldTypeInference | null;
  isOverridden: boolean;
  hasSuggestion: boolean;
  needsReview: boolean;
  replacedType: string | null;
};

export const SEMANTIC_TYPES_STORAGE_KEY = "metabase-prototype-semantic-types";

function parseFacets(value: unknown): Facets {
  if (!isObject(value)) {
    return {};
  }
  return Object.fromEntries(
    FACET_KEYS.flatMap((facetKey: FacetKey) => {
      const type = value[facetKey];
      return typeof type === "string" ? [[facetKey, type]] : [];
    }),
  );
}

function parseTableOverrides(value: unknown): TableOverrides {
  if (!isObject(value)) {
    return {};
  }
  return {
    subject: isTableSubject(value.subject) ? value.subject : undefined,
    singular: typeof value.singular === "string" ? value.singular : undefined,
    plural: typeof value.plural === "string" ? value.plural : undefined,
  };
}

function parseFieldValue(value: unknown): FieldTypeValue {
  if (!isObject(value)) {
    return { semanticType: null, facets: {} };
  }
  return {
    semanticType:
      typeof value.semanticType === "string" ? value.semanticType : null,
    facets: parseFacets(value.facets),
  };
}

function parseState(value: unknown): SemanticTypesState {
  if (!isObject(value)) {
    return { tables: {}, fields: {} };
  }
  return {
    tables: isObject(value.tables)
      ? _.mapObject(value.tables, parseTableOverrides)
      : {},
    fields: isObject(value.fields)
      ? _.mapObject(value.fields, parseFieldValue)
      : {},
  };
}

const getTableKey = (table: Pick<Table, "db_id" | "id">) =>
  `${table.db_id}:${table.id}`;

const getFieldKey = (field: Field) => String(getRawTableFieldId(field));

function resolveSubject(
  table: SemanticTable,
  inference: SubjectInference,
  overrides: TableOverrides,
): ResolvedSubject {
  const isOverridden = overrides.subject != null;
  const subject = overrides.subject ?? inference.subject;
  const syncSubject = isTableSubject(table.entity_type)
    ? table.entity_type
    : NO_SUBJECT;
  const hasSuggestion =
    !isOverridden &&
    inference.subject != null &&
    inference.subject !== syncSubject;
  const replacesSyncSubject =
    syncSubject !== NO_SUBJECT &&
    inference.subject != null &&
    !isSubjectA(inference.subject, syncSubject);
  const defaultRowNouns = getRowNouns(table.display_name);
  return {
    subject: subject === NO_SUBJECT ? null : subject,
    inference,
    isOverridden,
    hasSuggestion,
    needsReview:
      hasSuggestion && (inference.confidence === "low" || replacesSyncSubject),
    rowNouns: {
      singular: overrides.singular ?? defaultRowNouns.singular,
      plural: overrides.plural ?? defaultRowNouns.plural,
    },
    defaultRowNouns,
  };
}

function resolveFieldType(
  field: Field,
  inference: FieldTypeInference | null,
  override: FieldTypeValue | undefined,
): ResolvedFieldType {
  const syncType = field.semantic_type ?? null;
  const proposedType = inference?.semanticType ?? null;
  const changesType = proposedType != null && proposedType !== syncType;
  const hasFacets = inference != null && !_.isEmpty(inference.facets);
  const hasSuggestion = override == null && (changesType || hasFacets);
  const replacedType =
    changesType && syncType != null && !isFieldTypeA(proposedType, syncType)
      ? syncType
      : null;
  return {
    semanticType: override ? override.semanticType : (proposedType ?? syncType),
    facets: override ? override.facets : (inference?.facets ?? {}),
    inference,
    isOverridden: override != null,
    hasSuggestion,
    needsReview:
      hasSuggestion &&
      (inference?.confidence === "low" || replacedType != null),
    replacedType: override == null ? replacedType : null,
  };
}

export type SemanticTypesUpdate = {
  subjects?: { table: SemanticTable; subject: TableSubject }[];
  fields?: { field: Field; value: FieldTypeValue }[];
};

export function useSemanticTypes() {
  const [state, updateState] = usePrototypeStorage(
    SEMANTIC_TYPES_STORAGE_KEY,
    parseState,
  );
  const { getTableStructure } = useTableStructures();

  const getTableSubject = useCallback(
    (table: SemanticTable): ResolvedSubject => {
      const { role } = getTableStructure({
        ...table,
        fields: table.fields ?? [],
      });
      return resolveSubject(
        table,
        inferTableSubject(table, role),
        state.tables[getTableKey(table)] ?? {},
      );
    },
    [state, getTableStructure],
  );

  const getFieldTypes = useCallback(
    (
      table: SemanticTable,
      schemaTables: SemanticTable[],
    ): Map<FieldId, ResolvedFieldType> => {
      const fields = table.fields ?? [];
      const { role } = getTableStructure({ ...table, fields });
      const tableByFieldId = new Map(
        schemaTables.flatMap((schemaTable) =>
          (schemaTable.fields ?? []).map((field) => [
            getRawTableFieldId(field),
            schemaTable,
          ]),
        ),
      );
      const getTargetSubject = (field: Field) => {
        const target =
          field.fk_target_field_id != null
            ? tableByFieldId.get(field.fk_target_field_id)
            : undefined;
        return target ? getTableSubject(target).subject : null;
      };
      const inferences = inferTableFieldTypes({
        fields,
        role,
        getTargetSubject,
      });
      return new Map(
        fields.map((field) => {
          const fieldId = getRawTableFieldId(field);
          return [
            fieldId,
            resolveFieldType(
              field,
              inferences.get(fieldId) ?? null,
              state.fields[getFieldKey(field)],
            ),
          ];
        }),
      );
    },
    [state, getTableStructure, getTableSubject],
  );

  const update = useCallback(
    ({ subjects = [], fields = [] }: SemanticTypesUpdate) =>
      updateState((current) => ({
        tables: subjects.reduce(
          (tables, { table, subject }) => ({
            ...tables,
            [getTableKey(table)]: {
              ...tables[getTableKey(table)],
              subject,
            },
          }),
          current.tables,
        ),
        fields: fields.reduce(
          (fieldValues, { field, value }) => ({
            ...fieldValues,
            [getFieldKey(field)]: value,
          }),
          current.fields,
        ),
      })),
    [updateState],
  );

  const setTableSubject = useCallback(
    (table: SemanticTable, subject: TableSubject) =>
      update({ subjects: [{ table, subject }] }),
    [update],
  );

  const setRowNouns = useCallback(
    (table: SemanticTable, rowNouns: Partial<RowNouns>) => {
      const tableKey = getTableKey(table);
      updateState((current) => ({
        ...current,
        tables: {
          ...current.tables,
          [tableKey]: {
            ...current.tables[tableKey],
            ..._.mapObject(rowNouns, (noun) => noun || undefined),
          },
        },
      }));
    },
    [updateState],
  );

  const setFieldType = useCallback(
    (field: Field, value: FieldTypeValue) =>
      update({ fields: [{ field, value }] }),
    [update],
  );

  return {
    getTableSubject,
    getFieldTypes,
    setTableSubject,
    setRowNouns,
    setFieldType,
    update,
  };
}

export function useTableSemantics(table: SemanticTable) {
  const semanticTypes = useSemanticTypes();
  const { tables: schemaTables } = useSchemaTables(table);
  const { getTableSubject, getFieldTypes } = semanticTypes;
  const subject = useMemo(
    () => getTableSubject(table),
    [getTableSubject, table],
  );
  const fieldTypes = useMemo(
    () => getFieldTypes(table, schemaTables),
    [getFieldTypes, table, schemaTables],
  );
  return { ...semanticTypes, subject, fieldTypes };
}

export function useSchemaSuggestions(schema: Pick<Table, "db_id" | "schema">) {
  const semanticTypes = useSemanticTypes();
  const { tables, isLoading } = useSchemaTables(schema);
  const { getTableSubject, getFieldTypes } = semanticTypes;
  const suggestions = useMemo(
    () =>
      getSuggestions(
        tables.map((table) => ({
          table,
          subject: getTableSubject(table),
          fieldTypes: getFieldTypes(table, tables),
        })),
      ),
    [tables, getTableSubject, getFieldTypes],
  );
  return { ...semanticTypes, tables, suggestions, isLoading };
}
