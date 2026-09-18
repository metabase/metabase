import { Outlet, Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

const dataAppLayout = () =>
  import(
    /* webpackChunkName: "data-apps" */ "./components/DataAppLayout/DataAppLayout"
  ).then(({ DataAppLayout }) => ({
    Component: function DataAppLayoutRoute() {
      return (
        <DataAppLayout>
          <Outlet />
        </DataAppLayout>
      );
    },
  }));

const dataAppView = () =>
  import(
    /* webpackChunkName: "data-apps" */ "./components/DataAppView/DataAppView"
  ).then(({ DataAppView }) => ({
    Component: DataAppView,
  }));

registerPagePrefetch(`${Urls.DATA_APP_ROOT_URL}/`, dataAppLayout);
registerPagePrefetch(`${Urls.DATA_APP_ROOT_URL}/`, dataAppView);

/**
 * Data-app host routes. Open to any signed-in user.
 *
 * Path can't be `/app/:name` because the server reserves `/app/*` for static
 * asset serving.
 */
export function getRoutes() {
  return (
    <Route path={`${Urls.DATA_APP_URL_SEGMENT}/:name`} lazy={dataAppLayout}>
      <Route index lazy={dataAppView} />
      {/* Sub-paths under /apps/:name are owned by the iframe's router.
          Same component — `DataAppView` just keeps the iframe mounted; the URL
          change is mirrored back from inside the iframe via
          `history.replaceState`. */}
      <Route path="*" lazy={dataAppView} />
    </Route>
  );
}
