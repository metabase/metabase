import React from "react";

import { t } from "c-3po";

import { Box } from "grid-styled";

import QuestionDataSource from "metabase/query_builder/components/view/QuestionDataSource";
import { ViewHeading } from "metabase/query_builder/components/view/ViewSection";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

export default function DataStep({ query }) {
  return (
    <Box mb={1}>
      <ViewHeading className="flex">
        <DatabaseSchemaAndTableDataSelector
          databases={query.metadata().databasesList()}
          selectedDatabaseId={query.databaseId()}
          selectedTableId={query.tableId()}
          setSourceTableFn={tableId => query.setTableId(tableId).update()}
          isInitiallyOpen={!query.tableId()}
          triggerElement={
            !query.tableId() ? (
              <NewQuestionTriggerElement />
            ) : (
              <QuestionDataSource query={query} noLink />
            )
          }
        />
      </ViewHeading>
    </Box>
  );
}

const NewQuestionTriggerElement = () => <span>{t`New Question`}</span>;
