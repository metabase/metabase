import { useCallback } from "react";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type { Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export type PivotModel = {
  name: string;
  columnCount: number;
  generatedAt: string;
};

// PROTOTYPE: mocked. Generated pivot models would be ordinary saved models
// matched by (value table, "pivot"); here only their summary is kept.
const STORAGE_KEY = "metabase-prototype-pivot-models";

function parsePivotModel(value: unknown): PivotModel | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const { name, columnCount, generatedAt } = value;
  return typeof name === "string" &&
    typeof columnCount === "number" &&
    typeof generatedAt === "string"
    ? { name, columnCount, generatedAt }
    : undefined;
}

function parseStorage(value: unknown): Record<string, PivotModel> {
  if (!isObject(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, model]) => {
      const pivotModel = parsePivotModel(model);
      return pivotModel ? [[key, pivotModel]] : [];
    }),
  );
}

const getPivotModelKey = (table: Pick<Table, "db_id" | "id">) =>
  `${table.db_id}:${table.id}:pivot`;

export function usePivotModel(table: Pick<Table, "db_id" | "id">) {
  const [storage, updateStorage] = usePrototypeStorage(
    STORAGE_KEY,
    parseStorage,
  );
  const key = getPivotModelKey(table);
  const savePivotModel = useCallback(
    (model: PivotModel) =>
      updateStorage((current) => ({ ...current, [key]: model })),
    [key, updateStorage],
  );
  return { pivotModel: storage[key], savePivotModel };
}
