import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

type Props = {
  query: Lib.Query;
  table?: Lib.TableMetadata | Lib.CardMetadata;
  stageIndex: number;
};

export const getUrl = ({
  query,
  table,
  stageIndex,
}: Props): string | undefined => {
  if (!table) {
    return;
  }

  const pickerInfo = Lib.pickerInfo(query, table);
  const tableInfo = Lib.displayInfo(query, stageIndex, table);

  if (!pickerInfo || !tableInfo) {
    return;
  }

  const { isModel, cardId, tableId, databaseId } = pickerInfo;

  if (cardId) {
    const payload = {
      id: cardId,
      name: tableInfo.displayName,
    };

    return isModel ? Urls.model(payload) : Urls.question(payload);
  } else {
    return Urls.tableRowsQuery(databaseId, tableId);
  }
};

export const isObjectWithModel = (
  item: unknown,
): item is { model: string; id: number } => {
  return (
    typeof item === "object" &&
    item !== null &&
    "model" in item &&
    "id" in item &&
    typeof (item as any).model === "string" &&
    typeof (item as any).id === "number"
  );
};

export function getDatabaseId(metadata: Metadata, tableId: TableId) {
  const cardId = getQuestionIdFromVirtualTableId(tableId);
  if (cardId != null) {
    const question = checkNotNull(metadata.question(cardId));
    return checkNotNull(question.card().database_id ?? question.databaseId());
  } else {
    const table = checkNotNull(metadata.table(tableId));
    return table.db_id;
  }
}
