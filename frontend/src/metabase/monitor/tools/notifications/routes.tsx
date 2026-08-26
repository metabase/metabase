import { Route } from "metabase/router";

const notificationsAdminPage = () =>
  import(
    /* webpackChunkName: "monitor-notifications" */ "./NotificationsAdminPage"
  ).then(({ NotificationsAdminPage }) => ({
    Component: NotificationsAdminPage,
  }));

export const getRoutes = () => (
  <>
    <Route index lazy={notificationsAdminPage} />
    <Route path=":notificationId" lazy={notificationsAdminPage} />
  </>
);
