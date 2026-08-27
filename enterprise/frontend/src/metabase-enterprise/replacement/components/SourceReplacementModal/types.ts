import type { Card, CardId, ConcreteTableId, Table } from "metabase-types/api";

export type TableEntityItem = {
  id: ConcreteTableId;
  type: "table";
  data?: TableEntityData;
};

export type TableEntityData = Pick<
  Table,
  "name" | "display_name" | "db_id" | "db" | "schema"
>;

export type CardEntityItem = {
  id: CardId;
  type: "card";
  data?: CardEntityData;
};

export type CardEntityData = Pick<
  Card,
  "name" | "type" | "database_id" | "collection" | "dashboard" | "document"
>;

export type EntityItem = TableEntityItem | CardEntityItem;
export type EntityItemType = EntityItem["type"];

export type TabType = "column-mappings" | "dependents";
