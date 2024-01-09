/* eslint-disable react/prop-types */
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import * as Lib from "metabase-lib";

export default function QuestionDataSelector({
  legacyQuery,
  query,
  updateQuestion,
  triggerElement,
}) {
  return (
    <DataSourceSelector
      containerClassName="DataPopoverContainer"
      hasTableSearch
      databaseQuery={{ saved: true }}
      selectedDatabaseId={Lib.databaseID(query)}
      selectedTableId={Lib.sourceTableOrCardId(query)}
      setSourceTableFn={tableId =>
        updateQuestion(
          legacyQuery.setTableId(tableId).setDefaultQuery().question(),
          {
            run: true,
          },
        )
      }
      triggerElement={triggerElement}
      isOpen
    />
  );
}
