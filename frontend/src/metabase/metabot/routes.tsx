import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { MetabotConversationPage } from "./components/MetabotConversationPage";
import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";
import { SlackConnectSuccess } from "./components/SlackConnectSuccess";

export const getMetabotRoutes = () => {
  return (
    <>
      {getMetabotQuickLinks()}
      <Route
        path={`${Urls.CONVERSATION_BASE_PATH}/:convoId`}
        element={<MetabotConversationPage />}
      />
      <Route path="slack-connect-success" element={<SlackConnectSuccess />} />
    </>
  );
};
