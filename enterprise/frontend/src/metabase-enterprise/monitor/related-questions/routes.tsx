import { Route } from "metabase/router";

const page = () =>
  import(/* webpackChunkName: "related-questions" */ "./pages").then(
    ({ RelatedQuestionsPage }) => ({ Component: RelatedQuestionsPage }),
  );

export function getRelatedQuestionsRoutes() {
  return <Route index lazy={page} />;
}
