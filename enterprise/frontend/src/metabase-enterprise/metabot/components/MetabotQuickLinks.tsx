import type { RouteObject } from "react-router-dom";
import { useMount } from "react-use";

import { useLocationWithQuery, useNavigation } from "metabase/routing/compat";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

const MetabotQuickLinkRedirect = () => {
  const { replace } = useNavigation();
  const location = useLocationWithQuery();
  const { submitInput } = useMetabotAgent("omnibot");
  const prompt = String(location.query?.q ?? "");

  useMount(() => {
    replace("/");

    if (prompt) {
      submitInput(prompt, { focusInput: true });
    }
  });

  return null;
};

export const getMetabotQuickLinks = () => {
  return null;
};

export const getMetabotQuickLinkRouteObjects = (): RouteObject[] => [
  {
    path: "metabot/new",
    element: <MetabotQuickLinkRedirect />,
  },
];
