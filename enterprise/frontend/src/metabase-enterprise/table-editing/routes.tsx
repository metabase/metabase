import { Route } from "metabase/router";

import { EditTableDataContainer } from "./table-edit/EditTableDataContainer";

export function getRoutes() {
  return (
    <Route
      path="databases/:dbId/tables/:tableId/edit(/:objectId)"
      component={EditTableDataContainer}
    />
  );
}
