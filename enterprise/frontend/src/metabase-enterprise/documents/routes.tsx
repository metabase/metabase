import { Route } from "metabase/hoc/Title";

import { DocumentPage } from "./components/DocumentPage";

export const getRoutes = () => (
  <Route path="document/:entityId" component={DocumentPage} />
);
