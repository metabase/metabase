import { Route } from "react-router";

import { EditTableDataContainer } from "./table-edit/EditTableDataContainer";
import { BrowseTableData } from "./table-view/BrowseTableData";

export function getRoutes() {
  return (
    <>
      <Route
        path="databases/:dbId/tables/:tableId"
        component={BrowseTableData}
      />
      <Route
        path="databases/:dbId/tables/:tableId/edit(/:objectId)"
        component={EditTableDataContainer}
      />
    </>
  );
}
