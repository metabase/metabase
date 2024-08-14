import type { Table } from "metabase-types/api";

export interface TableEntity extends Table {
  updateProperty: (name: string, value: string | number | null) => void;
}
