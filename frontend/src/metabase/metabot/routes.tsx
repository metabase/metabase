import { Route } from "react-router";

import { getMetabotQuickLinks } from "./components/MetabotQuickLinks";
import { SlackConnectSuccess } from "./components/SlackConnectSuccess";

export const getMetabotRoutes = () => {
  return (
    <>
      {getMetabotQuickLinks()}
      <Route path="slack-connect-success" component={SlackConnectSuccess} />
    </>
  );
};
