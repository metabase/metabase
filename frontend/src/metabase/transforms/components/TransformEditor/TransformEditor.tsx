import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import {
  QueryEditor,
  type QueryEditorUiOptions,
  type QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { EditTransformMenu } from "metabase-enterprise/transforms/components/TransformHeader/EditTransformMenu";
import * as Lib from "metabase-lib";
import type {
  Database,
  DatasetQuery,
  QueryTransformSource,
  Transform,
} from "metabase-types/api";

import { EditDefinitionButton } from "./EditDefinitionButton";
import { getEditorOptions } from "./utils";

export type TransformEditorProps = {
  source: QueryTransformSource;
  uiState: QueryEditorUiState;
  uiOptions?: QueryEditorUiOptions;
  proposedSource: QueryTransformSource | undefined;
  databases: Database[];
  onChangeSource: (source: QueryTransformSource) => void;
  onChangeUiState: (state: QueryEditorUiState) => void;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
  onRunQueryStart?: (query: DatasetQuery) => boolean | void;
  onBlur?: () => void;
  transform?: Transform;
  isEditMode?: boolean;
  readOnly?: boolean;
};

export function TransformEditor({
  source,
  proposedSource,
  databases,
  uiState,
  uiOptions,
  onChangeSource,
  onChangeUiState,
  onAcceptProposed,
  onRejectProposed,
  onRunQueryStart,
  onBlur,
  transform,
  isEditMode,
  readOnly,
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
  const mergedUiOptions = useMemo(
    () => ({ ...getEditorOptions(databases, !isEditMode), ...uiOptions }),
    [databases, isEditMode, uiOptions],
  );

  const isRemoteSyncReadOnly = useSelector(PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly);

  const showEditButton =
    !!transform && !readOnly && !isEditMode && !isRemoteSyncReadOnly;

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
      uiOptions={mergedUiOptions}
      proposedQuery={proposedQuery}
      onChangeQuery={handleQueryChange}
      onChangeUiState={onChangeUiState}
      onAcceptProposed={onAcceptProposed}
      onRejectProposed={onRejectProposed}
      onRunQueryStart={onRunQueryStart}
      onBlur={onBlur}
      topBarInnerContent={
        showEditButton &&
        (hasPremiumFeature("workspaces") && transform ? (
          <EditTransformMenu transform={transform} />
        ) : (
          <EditDefinitionButton
            bg="transparent"
            fz="sm"
            h="1.5rem"
            px="sm"
            size="xs"
            transformId={transform.id}
          />
        ))
      }
    />
  );
}
