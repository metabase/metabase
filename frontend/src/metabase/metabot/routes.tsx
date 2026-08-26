import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";

/**
 * The two pages keep separate chunk names. The Slack landing page has nothing to
 * do with the conversation page, so one name would make either fetch both.
 */
const metabotConversationPage = () =>
  import(
    /* webpackChunkName: "metabot" */ "./components/MetabotConversationPage"
  ).then(({ MetabotConversationPage }) => ({
    Component: MetabotConversationPage,
  }));

const slackConnectSuccess = () =>
  import(
    /* webpackChunkName: "metabot-slack-connect" */ "./components/SlackConnectSuccess"
  ).then(({ SlackConnectSuccess }) => ({ Component: SlackConnectSuccess }));

const metabotDashboardPage = () =>
  import(
    /* webpackChunkName: "metabot" */ "./components/MetabotDashboardPage"
  ).then(({ MetabotDashboardPage }) => ({ Component: MetabotDashboardPage }));

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
      <Route
        path={`${Urls.CONVERSATION_BASE_PATH}/:convoId/dashboard/:dashboardId`}
        lazy={metabotDashboardPage}
      />
      <Route path="slack-connect-success" lazy={slackConnectSuccess} />
    </>
  );
};
