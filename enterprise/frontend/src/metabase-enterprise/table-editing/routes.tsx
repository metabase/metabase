import { Route } from "metabase/router";

/**
 * No prefetch registration: the path carries the database and table ids before
 * the segment that names the page, and the registry matches on a prefix. A
 * prefix short enough to match would cover every browse database page.
 */
const editTableDataPage = () =>
  import("./table-edit/EditTableDataContainer").then(
    ({ EditTableDataContainer }) => ({ Component: EditTableDataContainer }),
  );

export function getRoutes() {
  return (
    <Route
      path="databases/:dbId/tables/:tableId/edit/:objectId?"
      lazy={editTableDataPage}
    />
  );
}
