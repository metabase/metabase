import { Route } from "metabase/router";

import { ExplorationPage } from "./pages/ExplorationPage";
import { NewExplorationDraftProvider } from "./pages/NewExplorationDraftProvider";
import { NewExplorationPage } from "./pages/NewExplorationPage";
import { NewExplorationPlanPage } from "./pages/NewExplorationPlanPage";

export const getRoutes = () => {
  return (
    <Route path="research">
      <Route element={<NewExplorationDraftProvider />}>
        <Route index element={<NewExplorationPage />} />
        <Route path="plan" element={<NewExplorationPlanPage />} />
      </Route>
      <Route path=":id" element={<ExplorationPage />} />
      <Route path=":id/page/:pageId" element={<ExplorationPage />} />
    </Route>
  );
};
