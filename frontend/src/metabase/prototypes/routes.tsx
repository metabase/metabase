import { Route } from "metabase/router";

const prototypesPage = () =>
  import(/* webpackChunkName: "prototypes" */ "./pages/PrototypesPage").then(
    ({ PrototypesPage }) => ({ Component: PrototypesPage }),
  );

export const getRoutes = () => (
  <Route path="prototypes">
    <Route index lazy={prototypesPage} />
    <Route path=":prototypeId" lazy={prototypesPage} />
  </Route>
);
