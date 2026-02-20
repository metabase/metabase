import { Route } from "metabase/routing/compat/react-router-v3";

import { EditTableDataContainer } from "./table-edit/EditTableDataContainer";

export function getRoutes() {
  return (
    <Route
      path="databases/:dbId/tables/:tableId/edit(/:objectId)"
      component={EditTableDataContainer}
    />
  );
}
