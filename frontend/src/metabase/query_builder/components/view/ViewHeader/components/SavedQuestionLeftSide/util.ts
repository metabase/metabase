import { useState } from "react";
import { useDeepCompareEffect } from "react-use";

import { useLazyGetTableQueryMetadataQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Table } from "metabase-types/api";

export function useHiddenSourceTables(question: Question) {
  const query = question.query();
  const { isEditable, isNative } = Lib.queryDisplayInfo(query);

  if (isNative) {
    // TODO
  }

  const tableIds: (string | number)[] = [];

  const tableId = Lib.sourceTableOrCardId(query);
  if (tableId != null) {
    tableIds.push(tableId);
  }

  for (const stageIndex of Lib.stageIndexes(query)) {
    for (const join of Lib.joins(query, stageIndex)) {
      const info = Lib.pickerInfo(query, Lib.joinedThing(query, join));
      if (info?.tableId != null) {
        tableIds.push(info.tableId);
      } else if (info?.cardId != null) {
        const id = getQuestionVirtualTableId(info.cardId);
        tableIds.push(id);
      }
    }
  }

  const [hiddenSourceTables, setHiddenSourceTables] = useState<Table[]>([]);
  const [trigger] = useLazyGetTableQueryMetadataQuery();
  useDeepCompareEffect(
    function () {
      async function query() {
        if (isEditable && tableIds.length === 0) {
          return [];
        }

        const results = await Promise.all(
          tableIds.map(tableId => trigger({ id: tableId })),
        );

        return results
          .map(result => result.data)
          .filter(
            (table): table is Table => table?.visibility_type === "hidden",
          );
      }

      query().then(hiddenTables => setHiddenSourceTables(hiddenTables));
    },
    [tableIds, isEditable, trigger],
  );

  return hiddenSourceTables;
}
