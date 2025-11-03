import { IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";

import { DataModel } from "./pages/DataModel";

export function getMetadataRoutes() {
  return (
    <Route>
      <IndexRoute component={DataModel} />
      <Route path="data">
        <Route title={t`Data`}>
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
            path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
            component={DataModel}
          />
          <Redirect
            from="database/:databaseId/schema/:schemaId/table/:tableId/settings"
            to="database/:databaseId/schema/:schemaId/table/:tableId"
          />
          <Redirect
            from="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
            to="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
          />
        </Route>
      </Route>
    </Route>
  );
}
