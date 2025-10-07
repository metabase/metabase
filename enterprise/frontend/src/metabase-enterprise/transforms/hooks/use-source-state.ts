import { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  type MetabotSuggestedTransform,
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import type { Transform, TransformSource } from "metabase-types/api";

interface UseSourceStateResult<SourceType> {
  source: SourceType | TransformSource;
  setSource: (source: SourceType) => void;
  suggestedTransform: MetabotSuggestedTransform | undefined;
  proposedSource: TransformSource | undefined;
  clearProposed: () => void;
  acceptProposed: (source: TransformSource) => void;
  isDirty: boolean;
}

export const useSourceState = <SourceType>(
  transformId: Transform["id"] | undefined,
  initialSource: SourceType,
): UseSourceStateResult<SourceType> => {
  const dispatch = useDispatch();

  const [source, setSource] = useState<SourceType | TransformSource>(
    initialSource,
  );

  const suggestedTransform = useSelector(
    (state) => getMetabotSuggestedTransform(state, transformId) as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;

  const isPropsedSame = useMemo(
    () => _.isEqual(suggestedTransform?.source, source),
    [suggestedTransform?.source, source],
  );
  const proposedSource = isPropsedSame ? undefined : suggestedTransform?.source;

  const isDirty = useMemo(() => {
    return !_.isEqual(initialSource, source) || !!proposedSource;
  }, [initialSource, source, proposedSource]);

  const handleSetSource = useCallback(
    (source: SourceType) => {
      dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
      setSource(source);
    },
    [dispatch, suggestedTransform],
  );

  const clearProposed = useCallback(() => {
    dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
  }, [dispatch, suggestedTransform]);

  const acceptProposed = useCallback(
    async (source: TransformSource) => {
      setSource(source);
      dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
    },
    [dispatch, suggestedTransform],
  );

  return {
    source,
    setSource: handleSetSource,
    isDirty,
    suggestedTransform,
    proposedSource,
    clearProposed,
    acceptProposed,
  };
};
