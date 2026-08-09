import { Route } from "metabase/router";

/**
 * No prefetch registration: these paths carry the transform id before the part
 * that identifies the page, and the registry matches on a prefix. A prefix short
 * enough to match would cover every other transform page as well.
 */
const transformInspectPage = () =>
  import("./pages/TransformInspectPage").then(({ TransformInspectPage }) => ({
    Component: TransformInspectPage,
  }));

const transformInspectorUpsellPage = () =>
  import("metabase-enterprise/transforms-python/upsells/PythonTransformsUpsellModal/TransformInspectorUpsellPage").then(
    ({ TransformInspectorUpsellPage }) => ({
      Component: TransformInspectorUpsellPage,
    }),
  );

export function getInspectorUpsellRoutes() {
  return (
    <>
      <Route path=":transformId/inspect" lazy={transformInspectorUpsellPage} />
      <Route
        path=":transformId/inspect/:lensId"
        lazy={transformInspectorUpsellPage}
      />
    </>
  );
}

export function getInspectorRoutes() {
  return (
    <>
      <Route path=":transformId/inspect" lazy={transformInspectPage} />
      <Route path=":transformId/inspect/:lensId" lazy={transformInspectPage} />
    </>
  );
}
