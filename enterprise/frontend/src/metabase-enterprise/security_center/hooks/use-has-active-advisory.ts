import { useListSecurityAdvisoriesQuery } from "metabase/api";

import { isAffected } from "../utils";

export function useHasActiveAdvisory(isAdmin: boolean = false) {
  const { data: response, isLoading } = useListSecurityAdvisoriesQuery(
    undefined,
    {
      skip: !isAdmin,
    },
  );

  return {
    // if we don't have any advisories (perhaps the sync is not working)
    // return undefined (meaning unknown), not false
    hasActiveAdvisory: response?.advisories.length
      ? response.advisories.some(isAffected)
      : undefined,
    isLoading,
  };
}
