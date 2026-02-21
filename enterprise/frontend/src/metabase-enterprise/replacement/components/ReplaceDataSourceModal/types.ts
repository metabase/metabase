import type { Card, CardId, ConcreteTableId, Table } from "metabase-types/api";

export type TableEntityItem = {
  id: ConcreteTableId;
  type: "table";
  data?: Table;
};

export type CardEntityItem = {
  id: CardId;
  type: "card";
  data?: Card;
};

export type EntityItem = TableEntityItem | CardEntityItem;
export type EntityItemType = EntityItem["type"];

export type TabType = "column-mappings" | "dependents";
