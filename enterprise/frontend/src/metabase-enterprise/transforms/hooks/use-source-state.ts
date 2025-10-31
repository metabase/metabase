import { useMemo, useState } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
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

export function useSourceState({
  transformId,
  initialSource,
}: UseSourceStateProps): UseSourceStateResult {
  const dispatch = useDispatch();

  const suggestedTransform = useSelector((state) =>
    getMetabotSuggestedTransform(state, transformId),
  );

  const [source, setSource] = useState(
    transformId != null
      ? initialSource
      : (suggestedTransform?.source ?? initialSource),
  );

  const proposedSource = useMemo(() => {
    return suggestedTransform != null &&
      !isSameSource(suggestedTransform.source, source)
      ? suggestedTransform.source
      : undefined;
  }, [source, suggestedTransform]);

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
      setSource(suggestedTransform.source);
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
