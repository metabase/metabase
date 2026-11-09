import { t } from "ttag";

import * as Urls from "metabase/urls";
import { singularize } from "metabase/utils/formatting";
import { formatValue } from "metabase/value-formatting";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import { isEntityName, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  Table as ApiTable,
  CardId,
  DatasetColumn,
  DatasetData,
  NormalizedTable,
  TableId,
  VisualizationSettings,
} from "metabase-types/api";

import type { ObjectId } from "./types";

export interface GetObjectNameArgs {
  table?: Table | null;
  question?: Question;
  cols: DatasetColumn[];
  zoomedRow: unknown[] | undefined;
}

export const getObjectName = ({
  table,
  question,
  cols,
  zoomedRow,
}: GetObjectNameArgs): string => {
  const entityNameColumn = cols && cols?.findIndex(isEntityName);

  if (zoomedRow?.length && zoomedRow[entityNameColumn]) {
    // Unjustified type cast. FIXME
    return zoomedRow[entityNameColumn] as string;
  }

  const tableObjectName = table && table.objectName();
  if (tableObjectName) {
    return tableObjectName;
  }
  const questionName = question && question.displayName();
  if (questionName) {
    return singularize(questionName);
  }
  return t`Item Detail`;
};

export const getIsPKFromSourcePredicate =
  ({ tableId, cardId }: { tableId?: TableId | null; cardId?: CardId | null }) =>
  (column: DatasetColumn): boolean =>
    Lib.isPrimaryKey(Lib.legacyColumnTypeInfo(column)) &&
    (cardId != null || column.table_id === tableId);

export interface GetDisplayIdArgs {
  cols: DatasetColumn[];
  zoomedRow: unknown[] | undefined;
  tableId?: TableId;
  settings: VisualizationSettings;
}

export const getDisplayId = ({
  cols,
  zoomedRow,
  tableId,
  settings,
}: GetDisplayIdArgs): ObjectId | null => {
  const isPKFromSource = getIsPKFromSourcePredicate({ tableId });
  const hasSinglePk = cols.filter(isPKFromSource).length === 1;

  if (!zoomedRow) {
    return null;
  }

  if (hasSinglePk) {
    const pkColumnIndex = cols.findIndex(isPKFromSource);
    const pkColumn = cols[pkColumnIndex];
    const columnSetting = settings?.column?.(pkColumn) ?? {};

    // Unjustified type cast. FIXME
    return formatValue(zoomedRow[pkColumnIndex], {
      ...columnSetting,
      column: pkColumn,
    }) as ObjectId;
  }

  const hasEntityName = cols && !!cols?.find(isEntityName);

  if (hasEntityName) {
    return null;
  }

  // TODO: respect user column reordering
  const defaultColumn = cols[0];
  const columnSetting = settings?.column?.(defaultColumn) ?? {};

  // Unjustified type cast. FIXME
  return formatValue(zoomedRow[0], {
    ...columnSetting,
    column: defaultColumn,
  }) as ObjectId;
};

export interface GetIdValueArgs {
  data: DatasetData;
  tableId?: TableId;
  cardId?: CardId | null;
}

export const getIdValue = ({
  data,
  tableId,
  cardId,
}: GetIdValueArgs): ObjectId | null => {
  if (!data) {
    return null;
  }

  const { cols, rows } = data;
  const columnIndex = cols.findIndex(
    getIsPKFromSourcePredicate({ tableId, cardId }),
  );
  // Unjustified type cast. FIXME
  return rows[0][columnIndex] as number;
};

export function getSingleResultsRow(data: DatasetData) {
  return data.rows.length === 1 ? data.rows[0] : undefined;
}

export const getSinglePKIndex = (cols: DatasetColumn[]) => {
  const pkCount = cols?.filter(isPK)?.length;
  if (pkCount !== 1) {
    return undefined;
  }
  const index = cols?.findIndex(isPK);

  return index === -1 ? undefined : index;
};

export function getApiTable(
  table: NormalizedTable | undefined | null,
): ApiTable | undefined {
  if (!table) {
    return undefined;
  }

  // Unjustified type cast. FIXME
  const apiTable: ApiTable = {
    ...table,
    fields: table.original_fields,
  } as ApiTable;

  return apiTable;
}

export function getRowUrl(
  question: Question,
  columns: DatasetColumn[],
  table: ApiTable | undefined,
  rowId: string | number,
): string | undefined {
  const pks = columns.filter(isPK);

  if (pks.length !== 1) {
    return undefined;
  }

  if (question.type() === "model") {
    return `/model/${question.slug()}/detail/${rowId}`;
  }

  if (typeof table?.id === "number") {
    const tableUrl = Urls.table({ id: table.id, name: table.display_name });

    return `${tableUrl}/detail/${rowId}`;
  }

  return undefined;
}
