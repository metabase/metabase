import { MetabotAsk } from "metabase/metabot/components/MetabotAsk";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { useSelector } from "metabase/redux";
import { getSettingsLoading } from "metabase/selectors/settings";

/**
 * Routes /question/ask to either the Metabot NLQ prompt view or the regular QueryBuilder, depending on NLQ access.
 */
export const MetabotQueryBuilder = (
  props: React.ComponentProps<typeof QueryBuilder>,
) => {
  const { hasNlqAccess, isLoading } = useUserMetabotPermissions();
  const areSettingsLoading = useSelector(getSettingsLoading);
  // Wait until settings and metabot permissions are both resolved before
  // deciding which view to render. Otherwise QueryBuilder may mount briefly
  // and rewrite the URL away from /question/ask, racing the metabot view.
  if (areSettingsLoading || isLoading) {
    return null;
  }

  if (!hasNlqAccess) {
    return <QueryBuilder {...props} />;
  }

  return <MetabotAsk />;
};
