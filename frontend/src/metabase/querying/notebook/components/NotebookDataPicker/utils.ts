import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

import type { DataSource } from "./types";

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

    return isModel ? Urls.model(payload) : Urls.card(payload);
  } else if (isConcreteTableId(tableId)) {
    return Urls.table({ id: tableId, name: tableInfo.displayName });
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
    // Unjustified type cast. FIXME
    typeof (item as any).model === "string" &&
    // Unjustified type cast. FIXME
    typeof (item as any).id === "number"
  );
};

export const getDataSourceFromTableId = (tableId: TableId): DataSource => {
  const cardId = getQuestionIdFromVirtualTableId(tableId);
  return cardId != null
    ? { type: "card", id: cardId }
    : { type: "table", id: tableId };
};

export const getMiniPickerDataSource = (
  item: MiniPickerPickableItem,
): DataSource | undefined => {
  if (item.model === "table") {
    return { type: "table", id: item.id };
  }
  const isCard =
    item.model === "card" ||
    item.model === "dataset" ||
    item.model === "metric";
  if (isCard && typeof item.id === "number") {
    return { type: "card", id: item.id };
  }
  return undefined;
};
