import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import {
  QueryEditor,
  type QueryEditorUiOptions,
  type QueryEditorUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { Database, QueryTransformSource } from "metabase-types/api";

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
    () => ({ ...getEditorOptions(databases), ...uiOptions }),
    [databases, uiOptions],
  );

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
    />
  );
}
