import { Route, registerPagePrefetch } from "metabase/router";

/**
 * The exploration pages, in one chunk. Every loader names it, so opening a
 * draft does not fetch the provider and the page separately. They render
 * visualizations, which is most of their weight.
 */
const newExplorationDraftProvider = () =>
  import(
    /* webpackChunkName: "explorations" */ "./pages/NewExplorationDraftProvider"
  ).then(({ NewExplorationDraftProvider }) => ({
    Component: NewExplorationDraftProvider,
  }));

const newExplorationPage = () =>
  import(
    /* webpackChunkName: "explorations" */ "./pages/NewExplorationPage"
  ).then(({ NewExplorationPage }) => ({
    Component: NewExplorationPage,
  }));

const newExplorationPlanPage = () =>
  import(
    /* webpackChunkName: "explorations" */ "./pages/NewExplorationPlanPage"
  ).then(({ NewExplorationPlanPage }) => ({
    Component: NewExplorationPlanPage,
  }));

const explorationPage = (view?: "summary") => () =>
  import(/* webpackChunkName: "explorations" */ "./pages/ExplorationPage").then(
    ({ ExplorationPage }) => ({
      Component: function ExplorationPageRoute() {
        return <ExplorationPage view={view} />;
      },
    }),
  );

registerPagePrefetch("/research", newExplorationPage);

export const getRoutes = () => {
  return (
    <Route path="research">
      <Route lazy={newExplorationDraftProvider}>
        <Route index lazy={newExplorationPage} />
        <Route path="plan" lazy={newExplorationPlanPage} />
      </Route>
      <Route path=":id" lazy={explorationPage()} />
      <Route path=":id/page/:pageId" lazy={explorationPage()} />
      <Route path=":id/summary" lazy={explorationPage("summary")} />
    </Route>
  );
};
