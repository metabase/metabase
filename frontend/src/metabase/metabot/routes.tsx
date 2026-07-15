import { Route } from "metabase/router";

import { MetabotConversationPage } from "./components/MetabotConversationPage";
import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";
import { SlackConnectSuccess } from "./components/SlackConnectSuccess";

export const getMetabotRoutes = () => {
  return (
    <>
      {getMetabotQuickLinks()}
      <Route
        path="metabot/conversation/:convoId"
        component={MetabotConversationPage}
      />
      <Route path="slack-connect-success" component={SlackConnectSuccess} />
    </>
  );
};
