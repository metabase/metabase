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
        element={<MetabotConversationPage />}
      />
      <Route path="slack-connect-success" element={<SlackConnectSuccess />} />
    </>
  );
};
