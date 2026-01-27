import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import {
  QueryEditor,
  type QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import * as Lib from "metabase-lib";
import type {
  Database,
  QueryTransformSource,
  TransformId,
} from "metabase-types/api";

import { EditDefinitionButton } from "./EditDefinitionButton";
import { getEditorOptions } from "./utils";

type TransformEditorProps = {
  source: QueryTransformSource;
  uiState: QueryEditorUiState;
  proposedSource: QueryTransformSource | undefined;
  databases: Database[];
  onChangeSource: (source: QueryTransformSource) => void;
  onChangeUiState: (state: QueryEditorUiState) => void;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
  onBlur?: () => void;
  isEditMode: boolean;
  transformId?: TransformId;
};

export function TransformEditor({
  source,
  proposedSource,
  databases,
  uiState,
  onChangeSource,
  onChangeUiState,
  onAcceptProposed,
  onRejectProposed,
  onBlur,
  isEditMode,
  transformId,
}: TransformEditorProps) {
  const metadata = useSelector(getMetadata);
  const query = useMemo(
    () => Lib.fromJsQueryAndMetadata(metadata, source.query),
    [source, metadata],
  );
  const proposedQuery = useMemo(
    () =>
      proposedSource
        ? Lib.fromJsQueryAndMetadata(metadata, proposedSource.query)
        : undefined,
    [proposedSource, metadata],
  );
  const uiOptions = useMemo(
    () => getEditorOptions(databases, !isEditMode),
    [databases, isEditMode],
  );

  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const showEditDefinitionButton =
    !!transformId && !isEditMode && !isRemoteSyncReadOnly;

  const handleQueryChange = (query: Lib.Query) => {
    const newSource: QueryTransformSource = {
      ...source,
      type: "query",
      query: Lib.toJsQuery(query),
    };

    onChangeSource(newSource);
  };

  return (
    <QueryEditor
      query={query}
      uiState={uiState}
      uiOptions={uiOptions}
      proposedQuery={proposedQuery}
      onChangeQuery={handleQueryChange}
      onChangeUiState={onChangeUiState}
      onAcceptProposed={onAcceptProposed}
      onRejectProposed={onRejectProposed}
      onBlur={onBlur}
      topBarInnerContent={
        showEditDefinitionButton && (
          <EditDefinitionButton
            bg="transparent"
            fz="sm"
            h="1.5rem"
            px="sm"
            size="xs"
            transformId={transformId}
          />
        )
      }
    />
  );
}
