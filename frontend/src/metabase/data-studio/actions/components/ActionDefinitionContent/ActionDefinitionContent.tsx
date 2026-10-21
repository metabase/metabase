import { type ReactNode, useState } from "react";

import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import type { Database, WritebackQueryAction } from "metabase-types/api";

import { ActionEditor } from "../ActionEditor";
import { ActionEditorPane } from "../ActionEditorPane";

type ActionDefinitionContentProps = {
  action: WritebackQueryAction;
  databases: Database[];
  topBarInnerContent?: ReactNode;
};

export function ActionDefinitionContent({
  action,
  databases,
  topBarInnerContent,
}: ActionDefinitionContentProps) {
  const [uiState, setUiState] = useState(getInitialUiState);

  return (
    <ActionEditorPane>
      <ActionEditor
        datasetQuery={action.dataset_query}
        uiState={uiState}
        databases={databases}
        readOnly
        topBarInnerContent={topBarInnerContent}
        onChangeDatasetQuery={() => undefined}
        onChangeUiState={setUiState}
      />
    </ActionEditorPane>
  );
}
