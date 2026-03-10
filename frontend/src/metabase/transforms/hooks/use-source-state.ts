import { useMemo, useState } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_METABOT } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
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
  source: DraftTransformSource,
  metadata: Metadata,
): DraftTransformSource {
  if (source.type !== "query") {
    return source;
  }

  const question = Question.create({ dataset_query: source.query, metadata });
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
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const suggestedTransform = useSelector((state) =>
    PLUGIN_METABOT.getMetabotSuggestedTransform(state, transformId),
  );

  const [source, setSource] = useState(() => {
    const rawSource =
      transformId != null
        ? initialSource
        : (suggestedTransform?.source ?? initialSource);
    return normalizeSource(rawSource, metadata);
  });

  const proposedSource = useMemo(() => {
    if (
      suggestedTransform != null &&
      !isSameSource(suggestedTransform.source, source)
    ) {
      return normalizeSource(suggestedTransform.source, metadata);
    }
    return undefined;
  }, [source, suggestedTransform, metadata]);

  const isDirty = useMemo(() => {
    return (
      transformId == null ||
      proposedSource != null ||
      !isSameSource(source, initialSource)
    );
  }, [source, initialSource, proposedSource, transformId]);

  const setSourceAndRejectProposed = (source: DraftTransformSource) => {
    if (suggestedTransform != null) {
      dispatch(
        PLUGIN_METABOT.deactivateSuggestedTransform(suggestedTransform.id),
      );
    }
    setSource(source);
  };

  const acceptProposed = () => {
    if (suggestedTransform != null) {
      setSource(normalizeSource(suggestedTransform.source, metadata));
      dispatch(
        PLUGIN_METABOT.deactivateSuggestedTransform(suggestedTransform.id),
      );
    }
  };

  const rejectProposed = () => {
    if (suggestedTransform != null) {
      dispatch(
        PLUGIN_METABOT.deactivateSuggestedTransform(suggestedTransform.id),
      );
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
