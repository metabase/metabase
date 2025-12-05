import { Route } from "react-router";

import { EditMeasurePage } from "./pages/EditMeasurePage";
import { NewMeasurePage } from "./pages/NewMeasurePage";

export function getDataStudioMeasureRoutes() {
  return (
    <>
      <Route path="measures/new" component={NewMeasurePage} />
      <Route path="measures/:measureId" component={EditMeasurePage} />
    </>
  );
}
