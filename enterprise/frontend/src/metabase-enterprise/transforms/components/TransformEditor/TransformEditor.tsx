import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import {
  QueryEditor,
  type QueryEditorUiOptions,
  type QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { EditDefinitionButton } from "metabase-enterprise/transforms/components/TransformEditor/EditDefinitionButton";
import { EditTransformMenu } from "metabase-enterprise/transforms/components/TransformHeader/EditTransformMenu";
import * as Lib from "metabase-lib";
import type {
  Database,
  DatasetQuery,
  QueryTransformSource,
  Transform,
  TransformId,
} from "metabase-types/api";

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
  transformId?: TransformId;
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
  const mergedUiOptions = useMemo(
    () => ({ ...getEditorOptions(databases, !isEditMode), ...uiOptions }),
    [databases, isEditMode, uiOptions],
  );

  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  const showEditButton =
    !!transformId &&
    !uiOptions?.readOnly &&
    !isEditMode &&
    !isRemoteSyncReadOnly;

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
            transformId={transformId}
          />
        ))
      }
    />
  );
}
