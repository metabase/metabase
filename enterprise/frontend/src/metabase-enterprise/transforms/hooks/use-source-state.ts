import { useCallback, useMemo, useState } from "react";

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

interface UseSourceStateResult {
  source: DraftTransformSource;
  proposedSource: DraftTransformSource | undefined;
  suggestedTransform: SuggestedTransform | undefined;
  isDirty: boolean;
  setSource: (source: DraftTransformSource) => void;
  acceptProposed: () => void;
  rejectProposed: () => void;
}

export function useSourceState(
  transformId: TransformId | undefined,
  initialSource: DraftTransformSource,
): UseSourceStateResult {
  const [source, setSource] = useState(initialSource);
  const dispatch = useDispatch();

  const suggestedTransform = useSelector((state) =>
    getMetabotSuggestedTransform(state, transformId),
  );

  const proposedSource = useMemo(() => {
    return suggestedTransform != null &&
      !isSameSource(suggestedTransform.source, source)
      ? suggestedTransform.source
      : undefined;
  }, [source, suggestedTransform]);

  const isDirty = useMemo(() => {
    return !isSameSource(source, initialSource) || proposedSource != null;
  }, [source, initialSource, proposedSource]);

  const setSourceAndDeactivate = useCallback(
    (source: DraftTransformSource) => {
      if (suggestedTransform != null) {
        dispatch(deactivateSuggestedTransform(suggestedTransform.id));
      }
      setSource(source);
    },
    [dispatch, suggestedTransform],
  );

  const acceptProposed = useCallback(async () => {
    if (suggestedTransform != null) {
      setSource(suggestedTransform.source);
      dispatch(deactivateSuggestedTransform(suggestedTransform.id));
    }
  }, [dispatch, suggestedTransform]);

  const rejectProposed = useCallback(() => {
    if (suggestedTransform != null) {
      dispatch(deactivateSuggestedTransform(suggestedTransform.id));
    }
  }, [dispatch, suggestedTransform]);

  return {
    source,
    proposedSource,
    suggestedTransform,
    isDirty,
    setSource: setSourceAndDeactivate,
    acceptProposed,
    rejectProposed,
  };
}
