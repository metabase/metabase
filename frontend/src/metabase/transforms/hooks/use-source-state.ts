import { useMemo, useState } from "react";

import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase/metabot/state";
import { selectQuestionFromOpts } from "metabase/metadata-store";
import { useDispatch, useSelector, useStore } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import type {
  DraftTransformSource,
  SuggestedTransform,
  TransformId,
} from "metabase-types/api";

import { isSameSource } from "../utils";

type UseSourceStateProps = {
  transformId?: TransformId;
  initialSource: DraftTransformSource;
};

type UseSourceStateResult = {
  source: DraftTransformSource;
  proposedSource: DraftTransformSource | undefined;
  suggestedTransform: SuggestedTransform | undefined;
  isDirty: boolean;
  setSource: (source: DraftTransformSource) => void;
  setSourceAndRejectProposed: (source: DraftTransformSource) => void;
  acceptProposed: () => void;
  rejectProposed: () => void;
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
    const updatedQuery = Lib.withNativeQuery(
      query,
      Lib.rawNativeQuery(query) ?? "",
    );
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
  const dispatch = useDispatch();
  // Read at call time: this normalizes on mount and in callbacks, never as a
  // subscribed value.
  const store = useStore();

  const suggestedTransform = useSelector((state) =>
    getMetabotSuggestedTransform(state, transformId),
  );

  const [source, setSource] = useState(() => {
    const rawSource =
      transformId != null
        ? initialSource
        : (suggestedTransform?.source ?? initialSource);
    return normalizeSource(store.getState(), rawSource);
  });

  const proposedSource = useMemo(() => {
    if (
      suggestedTransform != null &&
      !isSameSource(suggestedTransform.source, source)
    ) {
      return normalizeSource(store.getState(), suggestedTransform.source);
    }
    return undefined;
  }, [source, suggestedTransform, store]);

  const isDirty = useMemo(() => {
    return (
      transformId == null ||
      proposedSource != null ||
      !isSameSource(source, initialSource)
    );
  }, [source, initialSource, proposedSource, transformId]);

  const setSourceAndRejectProposed = (source: DraftTransformSource) => {
    if (suggestedTransform != null) {
      dispatch(deactivateSuggestedTransform(suggestedTransform.id));
    }
    setSource(source);
  };

  const acceptProposed = () => {
    if (suggestedTransform != null) {
      setSource(normalizeSource(store.getState(), suggestedTransform.source));
      dispatch(deactivateSuggestedTransform(suggestedTransform.id));
    }
  };

  const rejectProposed = () => {
    if (suggestedTransform != null) {
      dispatch(deactivateSuggestedTransform(suggestedTransform.id));
    }
  };

  return {
    source,
    proposedSource,
    suggestedTransform,
    isDirty,
    setSource,
    setSourceAndRejectProposed,
    acceptProposed,
    rejectProposed,
  };
}
