import type { Location } from "history";
import type { RouteObject } from "react-router-dom";

import { useCompatLocation, useCompatParams } from "metabase/routing/compat";

import { EditTableDataContainer } from "./table-edit/EditTableDataContainer";

const EditTableDataContainerWithRouteProps = () => {
  const location = useCompatLocation();
  const params = useCompatParams<{
    dbId?: string;
    tableId?: string;
    objectId?: string;
  }>();

  return (
    <EditTableDataContainer
      location={location as unknown as Location<{ query?: string }>}
      params={{
        dbId: params.dbId ?? "",
        tableId: params.tableId ?? "",
        objectId: params.objectId,
      }}
    />
  );
};

export function getRoutes() {
  return null;
}

export function getRouteObjects(): RouteObject[] {
  return [
    {
      path: "databases/:dbId/tables/:tableId/edit/:objectId?",
      element: <EditTableDataContainerWithRouteProps />,
    },
  ];
}
