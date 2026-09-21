import { Route } from "metabase/router";

const glossaryPage = () =>
  import(
    /* webpackChunkName: "data-studio-glossary" */ "./pages/GlossaryPage"
  ).then(({ GlossaryPage }) => ({ Component: GlossaryPage }));

export function getDataStudioGlossaryRoutes() {
  return <Route path="glossary" lazy={glossaryPage} />;
}
