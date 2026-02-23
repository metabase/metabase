import type { Location } from "history";
import type { RouteObject } from "react-router-dom";
import { useLocation, useParams } from "react-router-dom";

import { EditTableDataContainer } from "./table-edit/EditTableDataContainer";

const EditTableDataContainerWithRouteProps = () => {
  const location = useLocation();
  const params = useParams<{
    dbId?: string;
    tableId?: string;
    objectId?: string;
  }>();

  return (
    <EditTableDataContainer
      location={location as unknown as Location}
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
