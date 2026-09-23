import { Route } from "metabase/router";

const page = () =>
  import(/* webpackChunkName: "semantic-duplicates" */ "./pages").then(
    ({ SemanticDuplicatesPage }) => ({ Component: SemanticDuplicatesPage }),
  );

export function getSemanticDuplicatesRoutes() {
  return <Route index lazy={page} />;
}
