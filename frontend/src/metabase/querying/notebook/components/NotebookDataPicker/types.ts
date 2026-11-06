import type { CardId, TableId } from "metabase-types/api";

export type DataSource =
  | { type: "table"; id: TableId }
  | { type: "card"; id: CardId };
