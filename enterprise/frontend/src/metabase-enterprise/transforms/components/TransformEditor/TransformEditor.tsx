import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import {
  QueryEditor,
  type QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database, QueryTransformSource } from "metabase-types/api";

import { EditorHeader } from "./EditorHeader";
import { getEditorOptions, getQuery, getValidationResult } from "./utils";

type TransformEditorProps = {
  name?: string;
  source: QueryTransformSource;
  uiState: QueryEditorUiState;
  proposedSource: QueryTransformSource | undefined;
  databases: Database[];
  isNew: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onChangeSource: (source: QueryTransformSource) => void;
  onChangeUiState: (state: QueryEditorUiState) => void;
  onSave: () => void;
  onCancel: () => void;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
};

export function TransformEditor({
  name,
  source,
  proposedSource,
  databases,
  uiState,
  isNew,
  isDirty,
  isSaving,
  onSave,
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
      bg="background-primary"
      data-testid="transform-query-editor"
      gap={0}
    >
      <EditorHeader
        name={name}
        validationResult={validationResult}
        isNew={isNew}
        isDirty={isDirty}
        isSaving={isSaving}
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
