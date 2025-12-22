import { useCallback } from "react";

import { useDispatch } from "metabase/lib/redux";
import {
  getNavigateToPath,
  setNavigateToPath as setNavigateToPathAction,
} from "metabase-enterprise/metabot/state";

import { useMetabotSelector } from "./use-metabot-store";

export const useMetabotReactions = () => {
  const dispatch = useDispatch();

  const navigateToPath = useMetabotSelector(getNavigateToPath);

  const setNavigateToPath = useCallback(
    async (navigateToPath: string) => {
      dispatch(setNavigateToPathAction(navigateToPath));
    },
    [dispatch],
  );

  return {
    navigateToPath,
    setNavigateToPath,
  };
};
