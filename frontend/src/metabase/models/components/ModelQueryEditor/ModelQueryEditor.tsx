import { useMemo } from "react";

import { QueryEditor } from "metabase/querying/editor/components/QueryEditor";
import type { QueryEditorUiState } from "metabase/querying/editor/types";
import type * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import { getEditorOptions } from "./utils";

type ModelEditorProps = {
  query: Lib.Query;
  uiState: QueryEditorUiState;
  readOnly?: boolean;
  onChangeQuery: (newQuery: Lib.Query) => void;
  onChangeUiState: (newUiState: QueryEditorUiState) => void;
  onChangeResultMetadata?: (newResultMetadata: Field[] | null) => void;
};

export function ModelQueryEditor({
  query,
  uiState,
  readOnly = false,
  onChangeQuery,
  onChangeUiState,
  onChangeResultMetadata,
}: ModelEditorProps) {
  const uiOptions = useMemo(() => getEditorOptions(readOnly), [readOnly]);

  return (
    <QueryEditor
      query={query}
      uiState={uiState}
      uiOptions={uiOptions}
      onChangeQuery={onChangeQuery}
      onChangeUiState={onChangeUiState}
      onChangeResultMetadata={onChangeResultMetadata}
    />
  );
}
