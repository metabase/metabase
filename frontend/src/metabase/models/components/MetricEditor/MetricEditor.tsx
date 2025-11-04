import { useMemo } from "react";

import { QueryEditor } from "metabase/querying/editor/components/QueryEditor";
import type { QueryEditorUiState } from "metabase/querying/editor/types";
import { Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { CardId } from "metabase-types/api";

import { EditorHeader } from "./EditorHeader";
import { getEditorOptions, getValidationResult } from "./utils";

type MetricEditorProps = {
  id?: CardId;
  name: string;
  query: Lib.Query;
  uiState: QueryEditorUiState;
  isDirty: boolean;
  isSaving: boolean;
  onChangeName?: (name: string) => void;
  onChangeQuery: (query: Lib.Query) => void;
  onChangeUiState: (state: QueryEditorUiState) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function MetricEditor({
  id,
  name,
  query,
  uiState,
  isDirty,
  isSaving,
  onChangeName,
  onChangeQuery,
  onChangeUiState,
  onSave,
  onCancel,
}: MetricEditorProps) {
  const uiOptions = useMemo(() => getEditorOptions(), []);
  const validationResult = useMemo(() => getValidationResult(query), [query]);

  return (
    <Stack
      pos="relative"
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="metric-query-editor"
      gap={0}
    >
      <EditorHeader
        id={id}
        name={name}
        validationResult={validationResult}
        isDirty={isDirty}
        isSaving={isSaving}
        onChangeName={onChangeName}
        onSave={onSave}
        onCancel={onCancel}
      />
      <QueryEditor
        query={query}
        uiState={uiState}
        uiOptions={uiOptions}
        onChangeQuery={onChangeQuery}
        onChangeUiState={onChangeUiState}
      />
    </Stack>
  );
}
