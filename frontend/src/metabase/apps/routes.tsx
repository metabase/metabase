import { Route } from "metabase/hoc/Title";

import { ComponentEditor } from "./editor/ComponentEditor";

export const getRoutes = () => {
  return (
    <Route path="/apps">
      <Route path="new" component={ComponentEditor} />
      <Route path="edit/:id" component={ComponentEditor} />
    </Route>
  );
};
