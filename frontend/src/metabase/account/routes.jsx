import { IndexRedirect } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";

import AccountApp from "./app/containers/AccountApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";
import getNotificationRoutes from "./notifications/routes";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import UserProfileApp from "./profile/containers/UserProfileApp";

const getRoutes = (store, IsAuthenticated) => {
  return (
    <Route path="/account" component={IsAuthenticated}>
      <Route title={t`Account settings`} component={AccountApp}>
        <IndexRedirect to="profile" />
        <Route path="profile" component={UserProfileApp} />
        <Route path="password" component={UserPasswordApp} />
        <Route path="login-history" component={LoginHistoryApp} />
        {getNotificationRoutes()}
      </Route>
    </Route>
  );
};

export default getRoutes;
