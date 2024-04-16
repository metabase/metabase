import CS from "metabase/css/core/index.css";
import type { updateQuestion as updateQuestionAction } from "metabase/query_builder/actions";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatabaseId, TableId } from "metabase-types/api";

export const QuestionDataSelector = ({
  question,
  updateQuestion,
  triggerElement,
}: {
  question: Question;
  updateQuestion: typeof updateQuestionAction;
  triggerElement: JSX.Element;
}) => {
  const handleTableChange = (tableId: TableId, databaseId: DatabaseId) => {
    const metadata = question.metadata();
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
    const query = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
    updateQuestion(question.setQuery(query), { run: true });
  };

  return (
    <DataSourceSelector
      containerClassName={CS.z2}
      hasTableSearch
      databaseQuery={{ saved: true }}
      setSourceTableFn={handleTableChange}
      triggerElement={triggerElement}
      isOpen
    />
  );
};
