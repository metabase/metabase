import type { ComboboxItem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  CardId,
  DatasetColumn,
  Field,
  FieldValue,
  NormalizedField,
  Table,
  TableId,
} from "metabase-types/api";

const STAGE_INDEX = -1;

export function getFieldOption([value, label]: FieldValue): ComboboxItem {
  return {
    value: String(value),
    label: String(label ?? value),
  };
}

export function getFieldOptions(fieldValues: FieldValue[]): ComboboxItem[] {
  return fieldValues.filter(([value]) => value != null).map(getFieldOption);
}

type LegacyColumn = DatasetColumn | NormalizedField | Field;

type QueryAndColumn = { query: Lib.Query; column: Lib.ColumnMetadata };

export type ColumnListInfo = {
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

export const getQueryAndColumns = (
  metadataProvider: Lib.MetadataProvider,
  table: Pick<Table, "id" | "db_id"> | undefined,
  fields: LegacyColumn[],
): Map<LegacyColumn, QueryAndColumn> => {
  if (table === undefined) {
    return new Map();
  }

  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);

  if (tableMetadata === null) {
    return new Map();
  }

  const query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableMetadata,
  );

  return new Map(
    fields.map((field): [LegacyColumn, QueryAndColumn] => [
      field,
      { query, column: Lib.fromLegacyColumn(query, STAGE_INDEX, field) },
    ]),
  );
};
