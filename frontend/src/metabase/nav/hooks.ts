import { useDatabaseListQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

export function useShouldShowDatabasePromptBanner(): boolean | undefined {
  const isAdmin = useSelector(getUserIsAdmin);
  const isPaidPlan = useSelector(getIsPaidPlan);
  const isWhiteLabeling = useSelector(PLUGIN_SELECTORS.getIsWhiteLabeling);
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

  const onlyHasSampleDatabase =
    databases.length === 1 && databases[0].is_sample;
  return onlyHasSampleDatabase;
}
