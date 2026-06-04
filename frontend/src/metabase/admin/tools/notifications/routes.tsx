import { IndexRoute, Route } from "react-router";

import { NotificationsAdminPage } from "./NotificationsAdminPage";

export const getRoutes = () => (
  <>
    <IndexRoute component={NotificationsAdminPage} />
    <Route path=":notificationId" component={NotificationsAdminPage} />
  </>
);
