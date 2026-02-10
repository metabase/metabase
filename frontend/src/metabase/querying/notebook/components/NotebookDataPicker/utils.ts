import * as Urls from "metabase/lib/urls";
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
