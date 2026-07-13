import { Route } from "metabase/router";

import { NotificationsAdminPage } from "./NotificationsAdminPage";

export const getRoutes = () => (
  <>
    <Route index component={NotificationsAdminPage} />
    <Route path=":notificationId" component={NotificationsAdminPage} />
  </>
);
