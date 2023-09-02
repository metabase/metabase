import { useDatabaseListQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getIsWhiteLabeling } from "metabase/selectors/whitelabel";

export function useShouldShowDatabasePromptBanner(): boolean | undefined {
  const isAdmin = useSelector(getUserIsAdmin);
  const isPaidPlan = useSelector(getIsPaidPlan);
  const isWhiteLabeling = useSelector(getIsWhiteLabeling);
  const isEligibleForDatabasePromptBanner =
    isAdmin && isPaidPlan && !isWhiteLabeling;

  const { data: databases } = useDatabaseListQuery({
    enabled: isEligibleForDatabasePromptBanner,
  });

  if (!isEligibleForDatabasePromptBanner) {
    return false;
  }

  if (databases === undefined) {
    return undefined;
  }

  return databases.every(database => database.is_sample);
}
