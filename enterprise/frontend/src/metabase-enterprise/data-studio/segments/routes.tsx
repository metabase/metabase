import { Route } from "react-router";

import { EditSegmentPage } from "./pages/EditSegmentPage";
import { NewSegmentPage } from "./pages/NewSegmentPage";

export function getDataStudioSegmentRoutes() {
  return (
    <>
      <Route path="segments/new" component={NewSegmentPage} />
      <Route path="segments/:segmentId" component={EditSegmentPage} />
    </>
  );
}
