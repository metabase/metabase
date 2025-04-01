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

  if (pickerInfo.cardId != null) {
    const payload = {
      id: pickerInfo.cardId,
      name: tableInfo.displayName,
    };

    return pickerInfo.isModel ? Urls.model(payload) : Urls.question(payload);
  } else {
    return Urls.tableRowsQuery(pickerInfo.databaseId, pickerInfo.tableId);
  }
};
