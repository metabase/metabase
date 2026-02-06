import { IndexRedirect, Route } from "react-router";

import AccountApp from "./app/containers/AccountApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";
import { NotificationRoutes } from "./notifications/routes";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import UserProfileApp from "./profile/containers/UserProfileApp";

const getRoutes = (store, IsAuthenticated) => {
  return (
    <Route path="/account" component={IsAuthenticated}>
      <Route component={AccountApp}>
        <IndexRedirect to="profile" />
        <Route path="profile" component={UserProfileApp} />
        <Route path="password" component={UserPasswordApp} />
        <Route path="login-history" component={LoginHistoryApp} />
        <NotificationRoutes />
      </Route>
    </Route>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
