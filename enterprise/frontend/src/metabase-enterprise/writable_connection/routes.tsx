import { Route } from "metabase/router";

const writableConnectionInfoPage = () =>
  import(
    /* webpackChunkName: "writable-connection" */ "./pages/WritableConnectionInfoPage"
  ).then(({ WritableConnectionInfoPage }) => ({
    Component: WritableConnectionInfoPage,
  }));

export function getWritableConnectionInfoRoutes() {
  return (
    <Route path=":databaseId/write-data" lazy={writableConnectionInfoPage} />
  );
}
