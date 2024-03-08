import { IndexRedirect } from "react-router";

import { Route } from "metabase/hoc/Title";

import MetadataEditor from "./components/MetadataEditor/MetadataEditor";
import MetadataFieldSettings from "./components/MetadataFieldSettings";
import MetadataTableSettings from "./components/MetadataTableSettings";

export const getMetadataRoutes = () => (
  <>
    <IndexRedirect to="database" />
    <Route path="database" component={MetadataEditor} />
    <Route path="database/:databaseId" component={MetadataEditor} />
    <Route
      path="database/:databaseId/schema/:schemaId"
      component={MetadataEditor}
    />
    <Route
      path="database/:databaseId/schema/:schemaId/table/:tableId"
      component={MetadataEditor}
    />
    <Route
      path="database/:databaseId/schema/:schemaId/table/:tableId/settings"
      component={MetadataTableSettings}
    />
    <Route path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId">
      <IndexRedirect to="general" />
      <Route path=":section" component={MetadataFieldSettings} />
    </Route>
  </>
);
