import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";

const metabotConversationPage = () =>
  import("./components/MetabotConversationPage").then(
    ({ MetabotConversationPage }) => ({ Component: MetabotConversationPage }),
  );

const slackConnectSuccess = () =>
  import("./components/SlackConnectSuccess").then(
    ({ SlackConnectSuccess }) => ({ Component: SlackConnectSuccess }),
  );

registerPagePrefetch(
  `/${Urls.CONVERSATION_BASE_PATH}/`,
  metabotConversationPage,
);

export const getMetabotRoutes = () => {
  return (
    <>
      {getMetabotQuickLinks()}
      <Route
        path={`${Urls.CONVERSATION_BASE_PATH}/:convoId`}
        lazy={metabotConversationPage}
      />
      <Route path="slack-connect-success" lazy={slackConnectSuccess} />
    </>
  );
};
