import type { CardId, DatabaseId, TableId } from "metabase-types/api";

export type GetMetadataOpts = {
  databaseId?: DatabaseId;
  tableIds?: TableId[];
  cardIds?: CardId[];
};
