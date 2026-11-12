import { useCallback } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId, Table, TableId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export type VersionChoice = "at-event" | "current";

export type PastValuesSource = "none" | "history-table";

export type ChangingAttribute = {
  source: PastValuesSource;
  historyTableId: TableId | null;
  valueFieldId: FieldId | null;
  defaultVersion: VersionChoice;
};

type ChangingAttributesState = {
  attributes: Record<string, Partial<ChangingAttribute>>;
};

const STORAGE_KEY = "metabase-prototype-changing-attributes";

const HISTORY_NAME_RE =
  /_(history|hist|snapshots?|versions?|changes|log|scd)$|^(hist|history|scd)_/;

const nameOf = (field: Pick<Field, "name">) => field.name.toLowerCase();

const singular = (name: string) =>
  name.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");

const isVersionChoice = (value: unknown): value is VersionChoice =>
  value === "at-event" || value === "current";

const isSource = (value: unknown): value is PastValuesSource =>
  value === "none" || value === "history-table";

const parseId = (value: unknown): number | null | undefined =>
  value === null || typeof value === "number" ? value : undefined;

const parseTableId = (value: unknown): TableId | null | undefined =>
  value === null || typeof value === "number" || typeof value === "string"
    ? value
    : undefined;

function parseAttribute(value: unknown): Partial<ChangingAttribute> {
  if (!isObject(value)) {
    return {};
  }
  return _.omit(
    {
      source: isSource(value.source) ? value.source : undefined,
      historyTableId: parseTableId(value.historyTableId),
      valueFieldId: parseId(value.valueFieldId),
      defaultVersion: isVersionChoice(value.defaultVersion)
        ? value.defaultVersion
        : undefined,
    },
    (entry) => entry === undefined,
  );
}

function parseState(value: unknown): ChangingAttributesState {
  return {
    attributes:
      isObject(value) && isObject(value.attributes)
        ? _.mapObject(value.attributes, parseAttribute)
        : {},
  };
}

export function isHistoryTableName(table: Pick<Table, "name">) {
  return HISTORY_NAME_RE.test(table.name.toLowerCase());
}

/** Other tables that could keep a table's old values, likeliest first */
export function getHistoryTableCandidates(
  dimensionTable: Pick<Table, "id" | "name">,
  tables: Table[],
  isHistoryTable: (table: Table) => boolean = isHistoryTableName,
): Table[] {
  const base = singular(dimensionTable.name);
  return _.sortBy(
    tables.filter(
      (other) => other.id !== dimensionTable.id && isHistoryTable(other),
    ),
    (other) => (other.name.toLowerCase().startsWith(base) ? 0 : 1),
  );
}

export function findColumnByName(
  table: Pick<Table, "fields"> | undefined,
  field: Pick<Field, "name">,
) {
  return table?.fields?.find((other) => nameOf(other) === nameOf(field));
}

export function findFieldById(
  table: Pick<Table, "fields"> | undefined,
  fieldId: FieldId | null,
) {
  return fieldId == null
    ? undefined
    : table?.fields?.find((field) => getRawTableFieldId(field) === fieldId);
}

const attributeKey = (field: Field) => String(getRawTableFieldId(field));

/**
 * PROTOTYPE: mocked. Per field: whether its old values are kept, in which
 * history table and column, and which value other tables use. Unset fields
 * are inferred from a history table with a column of the same name.
 */
export function useChangingAttributes() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getAttribute = useCallback(
    (
      field: Field,
      dimensionTable: Table,
      tables: Table[],
    ): ChangingAttribute => {
      const overrides = state.attributes[attributeKey(field)] ?? {};
      const inferredTable = getHistoryTableCandidates(
        dimensionTable,
        tables,
      ).find((candidate) => findColumnByName(candidate, field) != null);
      const historyTableId =
        overrides.historyTableId !== undefined
          ? overrides.historyTableId
          : (inferredTable?.id ?? null);
      const historyTable = tables.find((table) => table.id === historyTableId);
      const inferredColumn = findColumnByName(historyTable, field);
      const inferredColumnId = inferredColumn
        ? getRawTableFieldId(inferredColumn)
        : null;
      return {
        source: overrides.source ?? (inferredTable ? "history-table" : "none"),
        historyTableId,
        valueFieldId:
          overrides.valueFieldId !== undefined
            ? overrides.valueFieldId
            : inferredColumnId,
        defaultVersion: overrides.defaultVersion ?? "at-event",
      };
    },
    [state],
  );

  const setAttribute = useCallback(
    (field: Field, update: Partial<ChangingAttribute>) =>
      updateState((current) => ({
        ...current,
        attributes: {
          ...current.attributes,
          [attributeKey(field)]: {
            ...current.attributes[attributeKey(field)],
            ...update,
          },
        },
      })),
    [updateState],
  );

  return { getAttribute, setAttribute };
}
