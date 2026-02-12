import { useMemo } from "react";

import { QueryEditor } from "metabase/querying/editor/components/QueryEditor";
import type { QueryEditorUiState } from "metabase/querying/editor/types";
import type * as Lib from "metabase-lib";

import { getEditorOptions } from "./utils";

type MetricQueryEditorProps = {
  query: Lib.Query;
  uiState: QueryEditorUiState;
  readOnly?: boolean;
  onChangeQuery: (query: Lib.Query) => void;
  onChangeUiState: (state: QueryEditorUiState) => void;
};

export function MetricQueryEditor({
  query,
  uiState,
  readOnly = false,
  onChangeQuery,
  onChangeUiState,
}: MetricQueryEditorProps) {
  const uiOptions = useMemo(
    () => getEditorOptions(query, readOnly),
    [query, readOnly],
  );

  return (
    <QueryEditor
      query={query}
      uiState={uiState}
      uiOptions={uiOptions}
      onChangeQuery={onChangeQuery}
      onChangeUiState={onChangeUiState}
    />
  );
}
