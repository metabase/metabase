/* eslint-disable react/prop-types */
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";

export default function QuestionDataSelector({
  query,
  updateQuestion,
  triggerElement,
}) {
  return (
    <DataSourceSelector
      containerClassName="DataPopoverContainer"
      hasTableSearch
      databaseQuery={{ saved: true }}
      selectedDatabaseId={query.databaseId()}
      selectedTableId={query.tableId()}
      setSourceTableFn={tableId =>
        updateQuestion(query.setTableId(tableId), {
          run: true,
        })
      }
      triggerElement={triggerElement}
      isOpen
    />
  );
}
