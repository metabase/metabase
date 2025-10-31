import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import {
  QueryEditor,
  type QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  Database,
  QueryTransformSource,
  TransformId,
} from "metabase-types/api";

import { EditorHeader } from "./EditorHeader";
import { getEditorOptions, getQuery, getValidationResult } from "./utils";

type TransformEditorProps = {
  id?: TransformId;
  name: string;
  source: QueryTransformSource;
  uiState: QueryEditorUiState;
  proposedSource: QueryTransformSource | undefined;
  databases: Database[];
  isDirty: boolean;
  isSaving: boolean;
  onChangeName: (name: string) => void;
  onChangeSource: (source: QueryTransformSource) => void;
  onChangeUiState: (state: QueryEditorUiState) => void;
  onSave: () => void;
  onCancel: () => void;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
};

export function TransformEditor({
  id,
  name,
  source,
  proposedSource,
  databases,
  uiState,
  isDirty,
  isSaving,
  onSave,
  onChangeName,
  onChangeSource,
  onChangeUiState,
  onCancel,
  onAcceptProposed,
  onRejectProposed,
}: TransformEditorProps) {
  const metadata = useSelector(getMetadata);
  const query = useMemo(() => getQuery(source, metadata), [source, metadata]);
  const proposedQuery = useMemo(
    () => (proposedSource ? getQuery(proposedSource, metadata) : undefined),
    [proposedSource, metadata],
  );
  const uiOptions = useMemo(() => getEditorOptions(databases), [databases]);
  const validationResult = useMemo(() => getValidationResult(query), [query]);

  const handleQueryChange = (query: Lib.Query) => {
    onChangeSource({ type: "query", query: Lib.toJsQuery(query) });
  };

  return (
    <Stack
      pos="relative"
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="transform-query-editor"
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
        proposedQuery={proposedQuery}
        onChangeQuery={handleQueryChange}
        onChangeUiState={onChangeUiState}
        onAcceptProposed={onAcceptProposed}
        onRejectProposed={onRejectProposed}
      />
    </Stack>
  );
}
