import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/utils/redux";
import {
  getNavigateToPath,
  setNavigateToPath as setNavigateToPathAction,
} from "metabase/metabot/state";

export const useMetabotReactions = () => {
  const dispatch = useDispatch();

  const navigateToPath = useSelector(getNavigateToPath);

  const setNavigateToPath = useCallback(
    async (navigateToPath: string | null) => {
      dispatch(setNavigateToPathAction(navigateToPath));
    },
    [dispatch],
  );

  return {
    navigateToPath,
    setNavigateToPath,
  };
};
