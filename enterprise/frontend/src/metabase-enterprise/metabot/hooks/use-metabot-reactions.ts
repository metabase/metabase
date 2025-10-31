import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  getMetabotReactionsState,
  setNavigateToPath as setNavigateToPathAction,
} from "metabase-enterprise/metabot/state";

export const useMetabotReactions = () => {
  const dispatch = useDispatch();

  const { navigateToPath } = useSelector(
    getMetabotReactionsState as any,
  ) as ReturnType<typeof getMetabotReactionsState>;

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
