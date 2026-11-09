import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type { DataSource } from "metabase/embedding-sdk/types/components/data-picker";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";

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

  if (pickerInfo.cardId != null) {
    const payload = {
      id: pickerInfo.cardId,
      name: tableInfo.displayName,
    };

    return pickerInfo.isModel ? Urls.model(payload) : Urls.card(payload);
  }

  return Urls.table({ id: pickerInfo.tableId, name: tableInfo.displayName });
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

export const getMiniPickerDataSource = (
  item: MiniPickerPickableItem,
): DataSource | undefined => {
  if (item.model === "table" && typeof item.id === "number") {
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
