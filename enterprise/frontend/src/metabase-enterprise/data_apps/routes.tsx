import { IndexRoute, Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { DataAppLayout } from "./components/DataAppLayout/DataAppLayout";
import { DataAppView } from "./components/DataAppView/DataAppView";

/**
 * Data-app host routes. Open to any signed-in user.
 *
 * Path can't be `/app/:name` because the server reserves `/app/*` for static
 * asset serving.
 */
export function getRoutes() {
  return (
    <Route
      path={`${Urls.DATA_APP_URL_SEGMENT}/:name`}
      component={DataAppLayout}
    >
      <IndexRoute component={DataAppView} />
      {/* Sub-paths under /apps/:name are owned by the iframe's router.
          Same component — `DataAppView` just keeps the iframe mounted; the URL
          change is mirrored back from inside the iframe via
          `history.replaceState`. */}
      <Route path="*" component={DataAppView} />
    </Route>
  );
}
