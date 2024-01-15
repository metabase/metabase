/* eslint-disable react/prop-types */
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import * as Lib from "metabase-lib";

export default function QuestionDataSelector({
  question,
  updateQuestion,
  triggerElement,
}) {
  const handleTableChange = (tableId, databaseId) => {
    const metadata = question.metadata();
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
    const query = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
    updateQuestion(question.setQuery(query), { run: true });
  };

  return (
    <DataSourceSelector
      containerClassName="DataPopoverContainer"
      hasTableSearch
      databaseQuery={{ saved: true }}
      setSourceTableFn={handleTableChange}
      triggerElement={triggerElement}
      isOpen
    />
  );
}
