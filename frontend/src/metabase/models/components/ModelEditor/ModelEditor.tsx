import { useMemo } from "react";

import { PaneHeaderActions } from "metabase/data-studio/components/PaneHeader";
import { QueryEditor } from "metabase/querying/editor/components/QueryEditor";
import type { QueryEditorUiState } from "metabase/querying/editor/types";
import { Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { CardId } from "metabase-types/api";

import { ModelHeader } from "../ModelHeader";

import { getEditorOptions, getValidationResult } from "./utils";

type ModelEditorProps = {
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

export function ModelEditor({
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
}: ModelEditorProps) {
  const uiOptions = useMemo(() => getEditorOptions(), []);
  const validationResult = useMemo(() => getValidationResult(query), [query]);

  return (
    <Stack
      pos="relative"
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="transform-query-editor"
      gap={0}
    >
      <ModelHeader
        id={id}
        name={name}
        actions={
          <PaneHeaderActions
            validationResult={validationResult}
            isDirty={isDirty}
            isSaving={isSaving}
            onSave={onSave}
            onCancel={onCancel}
          />
        }
        onChangeName={onChangeName}
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
