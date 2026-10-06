import { type ReactNode, useMemo } from "react";

import { QueryEditorWithParameters } from "metabase/parameters/components/QueryEditorWithParameters";
import type {
  QueryEditorUiOptions,
  QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
import * as Lib from "metabase-lib";
import type { Database, DatasetQuery } from "metabase-types/api";

import { useActionQuery } from "../../hooks/use-action-query";

type ActionEditorProps = {
  datasetQuery: DatasetQuery;
  uiState: QueryEditorUiState;
  databases: Database[];
  readOnly?: boolean;
  topBarInnerContent?: ReactNode;
  onChangeDatasetQuery: (datasetQuery: DatasetQuery) => void;
  onChangeUiState: (uiState: QueryEditorUiState) => void;
};

export function ActionEditor({
  datasetQuery,
  uiState,
  databases,
  readOnly = false,
  topBarInnerContent,
  onChangeDatasetQuery,
  onChangeUiState,
}: ActionEditorProps) {
  const query = useActionQuery(datasetQuery);
  const uiOptions = useMemo(
    (): QueryEditorUiOptions => ({
      readOnly,
      hidePreview: true,
      hideRunButton: true,
      hidePreviewQueryButton: true,
      resizable: false,
      shouldShowLibrary: false,
      shouldDisableDatabasePickerItem: (item) =>
        !databases.some((database) => database.id === item.id),
    }),
    [databases, readOnly],
  );

  return (
    <QueryEditorWithParameters
      query={query}
      uiState={uiState}
      uiOptions={uiOptions}
      topBarInnerContent={topBarInnerContent}
      parametersAreUserVisible={false}
      onChangeQuery={(query) => onChangeDatasetQuery(Lib.toJsQuery(query))}
      onChangeUiState={onChangeUiState}
    />
  );
}
