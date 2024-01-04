/* eslint-disable react/prop-types */
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";

export default function QuestionDataSelector({
  legacyQuery,
  updateQuestion,
  triggerElement,
}) {
  return (
    <DataSourceSelector
      containerClassName="DataPopoverContainer"
      hasTableSearch
      databaseQuery={{ saved: true }}
      selectedDatabaseId={legacyQuery.databaseId()}
      selectedTableId={legacyQuery.tableId()}
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
