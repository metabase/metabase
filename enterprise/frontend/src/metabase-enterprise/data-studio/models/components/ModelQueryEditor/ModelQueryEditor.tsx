import { useMemo } from "react";

import { QueryEditor } from "metabase/querying/editor/components/QueryEditor";
import type { QueryEditorUiState } from "metabase/querying/editor/types";
import type * as Lib from "metabase-lib";

import { getEditorOptions } from "./utils";

type ModelEditorProps = {
  query: Lib.Query;
  uiState: QueryEditorUiState;
  readOnly?: boolean;
  onChangeQuery: (newQuery: Lib.Query) => void;
  onChangeUiState: (newUiState: QueryEditorUiState) => void;
};

export function ModelQueryEditor({
  query,
  uiState,
  readOnly = false,
  onChangeQuery,
  onChangeUiState,
}: ModelEditorProps) {
  const uiOptions = useMemo(() => getEditorOptions(readOnly), [readOnly]);

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
