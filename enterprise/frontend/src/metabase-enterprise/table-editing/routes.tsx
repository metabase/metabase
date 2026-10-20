import { notFoundRoute } from "metabase/plugins/components/PluginPlaceholder";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

/**
 * This page registers no prefetch, unlike the other pages that were split.
 *
 * `registerPagePrefetch` takes a fixed path prefix and matches it against the
 * start of a hovered link's target. What names this page is the `edit` segment,
 * and it comes after two ids that differ per table, so no fixed prefix reaches
 * it. The longest one available stops at `databases`, which every browse
 * database link also starts with. Registering that would fetch this chunk on
 * hover of links that do not lead here.
 */
const editTableDataPage = () =>
  import(
    /* webpackChunkName: "table-editing" */ "./table-edit/EditTableDataContainer"
  ).then(({ EditTableDataContainer }) => ({
    Component: EditTableDataContainer,
  }));

export function getRoutes() {
  return (
    <Route
      path="databases/:dbId/tables/:tableId/edit/:objectId?"
      lazy={featureGatedRoute(
        "table_data_editing",
        editTableDataPage,
        notFoundRoute,
      )}
    />
  );
}
