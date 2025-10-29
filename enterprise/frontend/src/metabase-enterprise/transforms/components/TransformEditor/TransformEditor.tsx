import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import {
  QueryEditor,
  type QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { QueryTransformSource } from "metabase-types/api";

import { EditorHeader } from "./EditorHeader";

type TransformEditorProps = {
  name?: string;
  source: QueryTransformSource;
  uiState: QueryEditorUiState;
  proposedSource: QueryTransformSource | undefined;
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

  const query = useMemo(
    () => Question.create({ dataset_query: source.query, metadata }).query(),
    [source, metadata],
  );

  const proposedQuery = useMemo(
    () =>
      proposedSource
        ? Question.create({
            dataset_query: proposedSource.query,
            metadata,
          }).query()
        : undefined,
    [proposedSource, metadata],
  );

  const handleQueryChange = (query: Lib.Query) => {
    onChangeSource({ type: "query", query: Lib.toJsQuery(query) });
  };

  return (
    <>
      <Stack
        pos="relative"
        w="100%"
        h="100%"
        bg="bg-white"
        data-testid="transform-query-editor"
        gap={0}
      >
        <EditorHeader
          name={name}
          isNew={isNew}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={onSave}
          onCancel={onCancel}
        />
        <QueryEditor
          query={query}
          uiState={uiState}
          proposedQuery={proposedQuery}
          onChangeQuery={handleQueryChange}
          onChangeUiState={onChangeUiState}
          onAcceptProposed={onAcceptProposed}
          onRejectProposed={onRejectProposed}
        />
      </Stack>
    </>
  );
}
