import { Route, withRouteProps } from "metabase/router";

import { EditTableDataContainer } from "./table-edit/EditTableDataContainer";

const RoutedEditTableDataContainer = withRouteProps(EditTableDataContainer);

export function getRoutes() {
  return (
    <Route
      path="databases/:dbId/tables/:tableId/edit(/:objectId)"
      element={<RoutedEditTableDataContainer />}
    />
  );
}
