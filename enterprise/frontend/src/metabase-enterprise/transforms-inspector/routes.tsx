import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

/**
 * These pages register no prefetch, unlike the other pages that were split.
 *
 * `registerPagePrefetch` takes a fixed path prefix and matches it against the
 * start of a hovered link's target. What names these pages is the `inspect`
 * segment, and it comes after the transform id, so no fixed prefix reaches them.
 * The longest one available stops before the id, which every other transform
 * page also starts with. Registering that would fetch this chunk on hover of
 * links that do not lead here.
 */
const transformInspectPage = () =>
  import(
    /* webpackChunkName: "transforms-inspector" */ "./pages/TransformInspectPage"
  ).then(({ TransformInspectPage }) => ({
    Component: TransformInspectPage,
  }));

const transformInspectorUpsellPage = () =>
  import(
    /* webpackChunkName: "transforms-inspector-upsell" */ "metabase-enterprise/transforms-python/upsells/PythonTransformsUpsellModal/TransformInspectorUpsellPage"
  ).then(({ TransformInspectorUpsellPage }) => ({
    Component: TransformInspectorUpsellPage,
  }));

const inspectPage = featureGatedRoute(
  "transforms-python",
  transformInspectPage,
  transformInspectorUpsellPage,
);

export function getInspectorRoutes() {
  return (
    <>
      <Route path=":transformId/inspect" lazy={inspectPage} />
      <Route path=":transformId/inspect/:lensId" lazy={inspectPage} />
    </>
  );
}
