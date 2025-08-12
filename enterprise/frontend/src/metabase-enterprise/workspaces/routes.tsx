import { Route } from "metabase/hoc/Title";

import { WorkspacePage } from "./containers/WorkspacePage";

export const getWorkspaceRoutes = () => (
  <Route path="workspace/:id" component={WorkspacePage} />
);
