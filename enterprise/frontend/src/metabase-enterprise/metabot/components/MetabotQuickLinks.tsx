import { useMount } from "react-use";

import { useNavigation } from "metabase/routing/compat";
import { Route } from "metabase/routing/compat/react-router-v3";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export const getMetabotQuickLinks = () => {
  return (
    <Route
      key="metabot"
      path="metabot/new"
      component={(props) => {
        const { replace } = useNavigation();
        const { submitInput } = useMetabotAgent("omnibot");
        const prompt = String(props.location.query?.q ?? "");

        useMount(() => {
          replace("/");

          if (prompt) {
            submitInput(prompt, { focusInput: true });
          }
        });

        return null;
      }}
    />
  );
};
