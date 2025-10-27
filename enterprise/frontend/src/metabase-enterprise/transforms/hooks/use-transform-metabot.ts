import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import type { DraftTransformSource, Transform } from "metabase-types/api";

import { isSameSource } from "../utils";

export const useTransformMetabot = (
  transform: Transform | undefined,
  source: DraftTransformSource,
  onSourceChange: (newSource: DraftTransformSource) => void,
) => {
  const dispatch = useDispatch();
  const suggestedTransform = useSelector((state) =>
    getMetabotSuggestedTransform(state, transform?.id),
  );

  const proposedSource = useMemo(() => {
    return suggestedTransform == null ||
      isSameSource(source, suggestedTransform.source)
      ? undefined
      : suggestedTransform.source;
  }, [source, suggestedTransform]);

  const acceptProposed = () => {
    if (proposedSource != null) {
      onSourceChange(source);
      dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
    }
  };

  const rejectProposed = () => {
    dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
  };

  useRegisterMetabotContextProvider(async () => {
    return {
      user_is_viewing: [{ type: "transform", ...(transform || {}), source }],
    };
  }, [transform, source]);

  return {
    proposedSource,
    acceptProposed,
    rejectProposed,
  };
};
