import { Route } from "react-router";
import { replace } from "react-router-redux";
import { useMount } from "react-use";

import { useDispatch } from "metabase/lib/redux";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export const getMetabotQuickLinks = () => {
  return (
    <Route
      key="metabot"
      path="metabot/new"
      component={(props) => {
        const metabot = useMetabotAgent();
        const prompt = String(props.location.query?.q ?? "");
        const dispatch = useDispatch();

        useMount(() => {
          dispatch(replace("/"));

          if (prompt) {
            metabot.resetConversation();
            metabot.setVisible(true);
            metabot.submitInput(prompt);
          }
        });

        return null;
      }}
    />
  );
};
