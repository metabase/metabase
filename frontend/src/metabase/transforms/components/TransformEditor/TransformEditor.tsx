import { useMemo } from "react";

import { useMetadataProviderFactory } from "metabase/metadata-store";
import { QueryEditorWithParameters } from "metabase/parameters/components/QueryEditorWithParameters";
import type {
  QueryEditorUiOptions,
  QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
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
  const getMetadataProvider = useMetadataProviderFactory();
  const query = useMemo(
    () =>
      Lib.fromJsQuery(getMetadataProvider(source.query.database), source.query),
    [source, getMetadataProvider],
  );
  const proposedQuery = useMemo(
    () =>
      proposedSource
        ? Lib.fromJsQuery(
            getMetadataProvider(proposedSource.query.database),
            proposedSource.query,
          )
        : undefined,
    [proposedSource, getMetadataProvider],
  );
  const mergedUiOptions = useMemo(
    () => ({ ...getEditorOptions(databases, !isEditMode), ...uiOptions }),
    [databases, isEditMode, uiOptions],
  );

  const showEditButton = !!transform && !readOnly && !isEditMode;

  const handleQueryChange = (query: Lib.Query) => {
    const newSource: QueryTransformSource = {
      ...source,
      type: "query",
      query: Lib.toJsQuery(query),
    };

    onChangeSource(newSource);
  };

  return (
    <QueryEditorWithParameters
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
        showEditButton && (
          <EditDefinitionButton
            bg="transparent"
            fz="sm"
            h="1.5rem"
            px="sm"
            size="xs"
            transformId={transform.id}
          />
        )
      }
      parametersAreUserVisible={false}
    />
  );
}
