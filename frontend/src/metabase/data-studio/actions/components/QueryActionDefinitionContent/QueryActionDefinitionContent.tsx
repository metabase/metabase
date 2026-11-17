import { useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { Button } from "metabase/ui";
import type { Database, WritebackQueryAction } from "metabase-types/api";

import { QueryActionEditor } from "../QueryActionEditor";
import { QueryActionEditorPane } from "../QueryActionEditorPane";

type QueryActionDefinitionContentProps = {
  action: WritebackQueryAction;
  databases: Database[];
  canEdit?: boolean;
  editUrl?: string;
};

export function QueryActionDefinitionContent({
  action,
  databases,
  canEdit = false,
  editUrl,
}: QueryActionDefinitionContentProps) {
  const [uiState, setUiState] = useState(getInitialUiState);

  return (
    <QueryActionEditorPane>
      <QueryActionEditor
        datasetQuery={action.dataset_query}
        uiState={uiState}
        databases={databases}
        readOnly
        topBarInnerContent={
          canEdit &&
          editUrl != null && (
            <Button
              component={Link}
              to={editUrl}
              size="sm"
              style={{ flexShrink: 0 }}
            >
              {t`Edit definition`}
            </Button>
          )
        }
        onChangeDatasetQuery={() => undefined}
        onChangeUiState={setUiState}
      />
    </QueryActionEditorPane>
  );
}
