import type { Card, Table } from "metabase-types/api";

export type EntityInfoType = "table" | "card";

export type TableEntityInfo = {
  type: "table";
  table: Table;
};

export type CardEntityInfo = {
  type: "card";
  card: Card;
};

export type EntityInfo = TableEntityInfo | CardEntityInfo;
