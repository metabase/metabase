import { IndexRoute, Route } from "react-router";

import { AppView } from "./AppView";
import { DataAppLayout } from "./DataAppLayout";

/**
 * Data-app host routes. The caller mounts these under an admin route guard;
 * the backend bundle endpoint is additionally superuser-only.
 *
 * Path can't be `/app/:name` because the server reserves `/app/*` for static
 * asset serving.
 */
export function getRoutes() {
  return (
    <Route path="data-app/:name" component={DataAppLayout}>
      <IndexRoute component={AppView} />
      {/* Sub-paths under /data-app/:name are owned by the iframe's router.
          Same component — `AppView` just keeps the iframe mounted; the URL
          change is mirrored back from inside the iframe via
          `history.replaceState`. */}
      <Route path="*" component={AppView} />
    </Route>
  );
}
