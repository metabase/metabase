import { IndexRoute, Route } from "react-router";
import { t } from "ttag";

import CatalogPage from "metabase/catalog/CatalogPage";
import DatabaseView from "metabase/catalog/components/DatabaseView";
import TableView from "metabase/catalog/components/TableView";

const getCatalogRoutes = () => (
  <Route path="/catalog" title={t`Catalog`}>
    <IndexRoute component={CatalogPage} />
    <Route path="databases/:databaseId" component={DatabaseView} />
    <Route path="databases/:databaseId/schemas/:schemaId/tables/:tableId" component={TableView} />
  </Route>
);

export default getCatalogRoutes; 