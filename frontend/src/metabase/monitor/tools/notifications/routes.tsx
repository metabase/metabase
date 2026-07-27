import { Route } from "metabase/router";

import { NotificationsAdminPage } from "./NotificationsAdminPage";

export const getRoutes = () => (
  <>
    <Route index element={<NotificationsAdminPage />} />
    <Route path=":notificationId" element={<NotificationsAdminPage />} />
  </>
);
