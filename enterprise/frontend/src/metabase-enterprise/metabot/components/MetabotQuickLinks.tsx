import { Route } from "react-router";
import { replace } from "react-router-redux";
import { useMount } from "react-use";

import { useDispatch } from "metabase/lib/redux";
import { useMetabotConversation } from "metabase-enterprise/metabot/hooks";

export const getMetabotQuickLinks = () => {
  return (
    <Route
      key="metabot"
      path="metabot/new"
      component={(props) => {
        const { submitInput } = useMetabotConversation("omnibot");
        const prompt = String(props.location.query?.q ?? "");
        const dispatch = useDispatch();

        useMount(() => {
          dispatch(replace("/"));

          if (prompt) {
            submitInput(prompt, { focusInput: true });
          }
        });

        return null;
      }}
    />
  );
};
