import type {
  IndexInfo,
  IndexStructured,
  Table,
} from "metabase-types/api";

import type { IndexFormColumn, IndexFormState } from "./types";

let nextColumnIdCounter = 0;

export function nextColumnId(): string {
  nextColumnIdCounter += 1;
  return `col-${nextColumnIdCounter}`;
}

export function defaultIndexName(table: Pick<Table, "name">, columnNames: string[]): string {
  const base = `idx_${table.name}`;
  const suffix = columnNames.length > 0 ? `_${columnNames.join("_")}` : "";
  return (base + suffix).toLowerCase().slice(0, 63);
}

export function emptyFormState(): IndexFormState {
  return {
    name: "",
    columns: [],
    method: "btree",
    unique: false,
    concurrent: true,
    rawStatement: null,
  };
}

export function formStateFromIndex(index: IndexInfo): IndexFormState {
  const columns: IndexFormColumn[] = index.key_columns.map((name) => ({
    id: nextColumnId(),
    name,
    direction: "asc",
  }));
  return {
    name: index.name,
    columns,
    method: (index.access_method as IndexFormState["method"]) || "btree",
    unique: index.is_unique,
    concurrent: true,
    rawStatement: null,
  };
}

export function formStateToStructured(state: IndexFormState): IndexStructured {
  return {
    index_name: state.name,
    columns: state.columns.map(({ id: _id, ...rest }) => rest),
    unique: state.unique,
    concurrent: state.concurrent,
    if_not_exists: true,
    method: state.method,
  };
}

export function isFormValid(state: IndexFormState): boolean {
  if (state.rawStatement != null) {
    return state.rawStatement.trim().length > 0;
  }
  return state.name.trim().length > 0 && state.columns.length > 0;
}
