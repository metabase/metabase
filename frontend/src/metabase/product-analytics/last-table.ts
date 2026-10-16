import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId } from "metabase-types/api";

const STORAGE_KEY = "metabase.product-analytics.last-table-id";

/** The event table the user last analyzed, if any. */
export const getLastTableId = (): ConcreteTableId | undefined => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null || !/^\d+$/.test(raw)) {
      return undefined;
    }
    const id = Number(raw);
    return isConcreteTableId(id) ? id : undefined;
  } catch {
    return undefined;
  }
};

export const setLastTableId = (tableId: ConcreteTableId) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(tableId));
  } catch {
    // Storage can be disabled; the next new analysis then starts from the default table.
  }
};
