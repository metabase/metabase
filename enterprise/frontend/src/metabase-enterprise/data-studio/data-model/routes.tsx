import { IndexRoute, Redirect, Route } from "react-router";

import { DataModel } from "./pages/DataModel";

export function getDataStudioMetadataRoutes() {
  return (
    <>
      <IndexRoute component={DataModel} />
      <Route path="database" component={DataModel} />
      <Route path="database/:databaseId" component={DataModel} />
      <Route
        path="database/:databaseId/schema/:schemaId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId"
        component={DataModel}
      />
      <Redirect
        from="database/:databaseId/schema/:schemaId/table/:tableId/settings"
        to="database/:databaseId/schema/:schemaId/table/:tableId/field"
      />
      <Redirect
        from="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
        to="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
      />
      <Redirect
        from="database/:databaseId/schema/:schemaId/table/:tableId/settings"
        to="database/:databaseId/schema/:schemaId/table/:tableId/field"
      />
      <Redirect
        from="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
        to="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
      />
    </>
  );
}
