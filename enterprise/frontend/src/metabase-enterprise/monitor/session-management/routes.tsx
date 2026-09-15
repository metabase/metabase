import { Route } from "metabase/router";

const sessionsPage = () =>
  import(
    /* webpackChunkName: "monitor-session-management" */ "./SessionsPage"
  ).then(({ SessionsPage }) => ({
    Component: SessionsPage,
  }));

export function getSessionManagementRoutes() {
  return (
    <>
      <Route index lazy={sessionsPage} />
      <Route path=":sessionId" lazy={sessionsPage} />
    </>
  );
}
