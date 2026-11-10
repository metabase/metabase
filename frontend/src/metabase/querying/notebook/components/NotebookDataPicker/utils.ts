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

  const tableInfo = Lib.displayInfo(query, stageIndex, table);

  if (Lib.isCardMetadata(table)) {
    const payload = {
      id: Lib.pickerInfo(query, table).id,
      name: tableInfo.displayName,
    };

    return tableInfo.isModel ? Urls.model(payload) : Urls.card(payload);
  }

  return Urls.table({
    id: Lib.pickerInfo(query, table).id,
    name: tableInfo.displayName,
  });
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
