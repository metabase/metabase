import { useDatabaseListQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

export function useShouldShowDatabasePromptBanner() {
  const isAdmin = useSelector(getUserIsAdmin);
  const isPaidPlan = useSelector(getIsPaidPlan);
  const isWhiteLabeling = useSelector(PLUGIN_SELECTORS.getIsWhiteLabeling);

  const { data: databases = [] } = useDatabaseListQuery({
    enabled: isAdmin && isPaidPlan && !isWhiteLabeling,
  });
  const onlyHaveSampleDatabase =
    databases.length === 1 && databases[0].is_sample;

  return isAdmin && isPaidPlan && !isWhiteLabeling && onlyHaveSampleDatabase;
}
