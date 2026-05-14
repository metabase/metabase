import type {
  IndexAccessMethod,
  IndexColumnDirection,
  IndexInfo,
  IndexRequestId,
  IndexStructuredColumn,
} from "metabase-types/api";

export type FormMode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; requestId: IndexRequestId; existing: IndexInfo };

export interface IndexFormColumn extends IndexStructuredColumn {
  id: string;
}

export interface IndexFormState {
  name: string;
  columns: IndexFormColumn[];
  method: IndexAccessMethod;
  unique: boolean;
  concurrent: boolean;
  rawStatement: string | null;
}

export const ACCESS_METHODS: ReadonlyArray<{
  value: IndexAccessMethod;
  label: string;
}> = [
  { value: "btree", label: "B-tree" },
  { value: "hash", label: "Hash" },
  { value: "gin", label: "GIN" },
  { value: "gist", label: "GiST" },
  { value: "brin", label: "BRIN" },
  { value: "spgist", label: "SP-GiST" },
];

export const DIRECTIONS: ReadonlyArray<{
  value: IndexColumnDirection;
  label: string;
}> = [
  { value: "asc", label: "ASC" },
  { value: "desc", label: "DESC" },
];
