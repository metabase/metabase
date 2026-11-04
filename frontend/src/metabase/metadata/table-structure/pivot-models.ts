import { useCallback } from "react";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type { Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export type PivotModel = {
  id: number;
  name: string;
  tableId: number;
  propertyKeys: string[];
  generatedAt: string;
};

// PROTOTYPE: mocked. Generated pivot models would be ordinary saved models
// matched by (value table, "pivot"); here only their summary is kept.
const STORAGE_KEY = "metabase-prototype-pivot-models";
const FIRST_MODEL_ID = 9001;

function parsePivotModel(value: unknown): PivotModel | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const { id, name, tableId, propertyKeys, generatedAt } = value;
  const keys = Array.isArray(propertyKeys)
    ? propertyKeys.filter((key) => typeof key === "string")
    : null;
  return typeof id === "number" &&
    typeof name === "string" &&
    typeof tableId === "number" &&
    keys != null &&
    typeof generatedAt === "string"
    ? { id, name, tableId, propertyKeys: keys, generatedAt }
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
    (model: Omit<PivotModel, "id">) =>
      updateStorage((current) => ({
        ...current,
        [key]: {
          ...model,
          id: current[key]?.id ?? FIRST_MODEL_ID + Object.keys(current).length,
        },
      })),
    [key, updateStorage],
  );
  return { pivotModel: storage[key], savePivotModel };
}

export function usePivotModelById(id: number) {
  const [storage] = usePrototypeStorage(STORAGE_KEY, parseStorage);
  return Object.values(storage).find((model) => model.id === id);
}
