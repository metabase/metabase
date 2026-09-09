import { useMemo, useState } from "react";

import { selectQuestionFromOpts } from "metabase/metadata-store";
import { useStore } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import type { DraftTransformSource, TransformId } from "metabase-types/api";

import { isSameSource } from "../utils";

type UseSourceStateProps = {
  transformId?: TransformId;
  initialSource: DraftTransformSource;
};

type UseSourceStateResult = {
  source: DraftTransformSource;
  isDirty: boolean;
  setSource: (source: DraftTransformSource) => void;
};

/**
 * Normalizes a transform source by ensuring template tags are properly parsed.
 * Necessary for model references in a SQL transform to work correctly.
 */
function normalizeSource(
  state: State,
  source: DraftTransformSource,
): DraftTransformSource {
  if (source.type !== "query") {
    return source;
  }
  // Orphan: the source database has been deleted (e.g. a serdes-imported
  // transform whose source database is missing). The body is preserved as a
  // breadcrumb but cannot be normalized through MLv2 without a database.
  if (source.query?.database == null) {
    return source;
  }

  const question = selectQuestionFromOpts(state, {
    dataset_query: source.query,
  });
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  if (isNative) {
    const updatedQuery = Lib.withNativeQuery(query, Lib.rawNativeQuery(query));
    return {
      type: "query",
      // question.setQuery ensures template tags get processed
      query: question.setQuery(updatedQuery).datasetQuery(),
    };
  }

  return source;
}

export function useSourceState({
  transformId,
  initialSource,
}: UseSourceStateProps): UseSourceStateResult {
  const store = useStore();

  const [source, setSource] = useState(() =>
    normalizeSource(store.getState(), initialSource),
  );

  const isDirty = useMemo(() => {
    return transformId == null || !isSameSource(source, initialSource);
  }, [source, initialSource, transformId]);

  return {
    source,
    isDirty,
    setSource,
  };
}
