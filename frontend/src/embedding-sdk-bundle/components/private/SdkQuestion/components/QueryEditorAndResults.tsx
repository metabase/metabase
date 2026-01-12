import { useState } from "react";

import {
  QueryEditor,
  getInitialUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface QueryEditorAndResultsProps {
  question: Question;
}

export function QueryEditorAndResults(props: QueryEditorAndResultsProps) {
  const { question } = props;

  const [uiState, setUiState] = useState(getInitialUiState);

  const onQueryChange = (query: Lib.Query) => {
    console.log(query);
    // setDatasetQuery(Lib.toJsQuery(query));
  };

  return (
    <Stack w="100%" h="100%" gap={0}>
      <QueryEditor
        query={question.query()}
        uiState={uiState}
        onChangeQuery={onQueryChange}
        onChangeUiState={setUiState}
        onAcceptProposed={() => {}}
        onRejectProposed={() => {}}
      />
      <div
        style={{
          background: "lightgrey",
          width: "100%",
          height: "100%",
          minHeight: "100px",
        }}
      />
    </Stack>
  );
}
