import { Route, registerPagePrefetch } from "metabase/router";

/**
 * The exploration pages, in their own chunk. They render visualizations, which
 * is most of their weight.
 */
const newExplorationDraftProvider = () =>
  import("./pages/NewExplorationDraftProvider").then(
    ({ NewExplorationDraftProvider }) => ({
      Component: NewExplorationDraftProvider,
    }),
  );

const newExplorationPage = () =>
  import("./pages/NewExplorationPage").then(({ NewExplorationPage }) => ({
    Component: NewExplorationPage,
  }));

const newExplorationPlanPage = () =>
  import("./pages/NewExplorationPlanPage").then(
    ({ NewExplorationPlanPage }) => ({ Component: NewExplorationPlanPage }),
  );

const explorationPage = () =>
  import("./pages/ExplorationPage").then(({ ExplorationPage }) => ({
    Component: ExplorationPage,
  }));

registerPagePrefetch("/research", newExplorationPage);

export const getRoutes = () => {
  return (
    <Route path="research">
      <Route lazy={newExplorationDraftProvider}>
        <Route index lazy={newExplorationPage} />
        <Route path="plan" lazy={newExplorationPlanPage} />
      </Route>
      <Route path=":id" lazy={explorationPage} />
      <Route path=":id/page/:pageId" lazy={explorationPage} />
    </Route>
  );
};
