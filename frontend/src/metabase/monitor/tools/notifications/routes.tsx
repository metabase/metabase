import { Route, withRouteProps } from "metabase/router";

import { NotificationsAdminPage } from "./NotificationsAdminPage";

const RoutedNotificationsAdminPage = withRouteProps(NotificationsAdminPage);

export const getRoutes = () => (
  <>
    <Route index element={<RoutedNotificationsAdminPage />} />
    <Route path=":notificationId" element={<RoutedNotificationsAdminPage />} />
  </>
);
