import type { RouteObject } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { useMount } from "react-use";

import { useNavigation } from "metabase/routing";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

const MetabotQuickLinkRedirect = () => {
  const { replace } = useNavigation();
  const [searchParams] = useSearchParams();
  const { submitInput } = useMetabotAgent("omnibot");
  const prompt = String(searchParams.get("q") ?? "");

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
