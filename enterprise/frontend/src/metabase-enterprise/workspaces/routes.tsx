import { Route } from "react-router";

import { WorkspacePage } from "./components/WorkspacePage";

export const getWorkspaceRoutes = () => (
  <Route path="workspace">
    <Route
      path=":id"
      component={(props: any) => (
        <WorkspacePage workspaceId={parseInt(props.params.id)} />
      )}
    />
  </Route>
);