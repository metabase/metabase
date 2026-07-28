import { useMount } from "react-use";

import { MetabotAsk } from "metabase/metabot/components/MetabotAsk";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { useSelector } from "metabase/redux";
import { getSettingsLoading } from "metabase/selectors/settings";

/**
 * Routes /question/ask to either the Metabot prompt view or the regular QueryBuilder.
 *
 * Gated on Metabot access rather than query-building access: the assistant does more than build
 * queries, so a user without query building still gets a useful full-page assistant.
 */
export const MetabotQueryBuilder = (
  props: React.ComponentProps<typeof QueryBuilder>,
) => {
  const { hasMetabotAccess, isLoading } = useUserMetabotPermissions();
  const areSettingsLoading = useSelector(getSettingsLoading);
  const { createNewConversation } = useMetabotAgent("ask");

  useMount(createNewConversation);

  // Wait until settings and metabot permissions are both resolved before
  // deciding which view to render. Otherwise QueryBuilder may mount briefly
  // and rewrite the URL away from /question/ask, racing the metabot view.
  if (areSettingsLoading || isLoading) {
    return null;
  }

  if (!hasMetabotAccess) {
    return <QueryBuilder {...props} />;
  }

  return <MetabotAsk />;
};
