import * as Lib from "metabase-lib";
import type { CardId, TableId } from "metabase-types/api";

const STAGE_INDEX = -1;

type ColumnListInfo = {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
};

const getColumnListInfo = (
  metadataProvider: Lib.MetadataProvider,
  tableOrCardMetadata: Lib.TableMetadata | Lib.CardMetadata,
): ColumnListInfo => {
  const query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableOrCardMetadata,
  );
  return {
    query,
    stageIndex: STAGE_INDEX,
    columns: Lib.returnedColumns(query, STAGE_INDEX),
  };
};

export const getTableColumnListInfo = (
  metadataProvider: Lib.MetadataProvider,
  tableId: TableId,
): ColumnListInfo | undefined => {
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, tableId);
  if (tableMetadata == null) {
    return undefined;
  }
  return getColumnListInfo(metadataProvider, tableMetadata);
};

export const getCardColumnListInfo = (
  metadataProvider: Lib.MetadataProvider,
  cardId: CardId,
): ColumnListInfo | undefined => {
  const cardMetadata = Lib.cardMetadata(metadataProvider, cardId);
  if (cardMetadata == null) {
    return undefined;
  }
  return getColumnListInfo(metadataProvider, cardMetadata);
};
