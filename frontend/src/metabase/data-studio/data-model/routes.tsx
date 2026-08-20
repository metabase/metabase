import type { ComponentType } from "react";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route, redirect } from "metabase/router";

/**
 * The data model pages, in one chunk. Every loader names it, so the section
 * arrives in a single request.
 *
 * The Data Studio library tables routes load their own measure and segment
 * pages from the same two directories, and name a chunk of their own. Naming an
 * `import()` into a chunk another site already names merges the two module
 * sets, which copies whatever they shared into every other chunk that needs it.
 * Left apart, what the two sides share lands in a chunk both point at.
 *
 * The admin guard stays eager: it has to decide before there is anything to
 * show.
 */
const dataModel = () =>
  import(/* webpackChunkName: "data-model" */ "./pages/DataModel").then(
    ({ DataModel }) => ({ Component: DataModel }),
  );

const newSegmentPage = () =>
  import(
    /* webpackChunkName: "data-model" */ "metabase/data-studio/segments/pages/DataModelNewSegmentPage"
  ).then(({ DataModelNewSegmentPage }) => ({
    Component: DataModelNewSegmentPage,
  }));

const segmentDetailPage = () =>
  import(
    /* webpackChunkName: "data-model" */ "metabase/data-studio/segments/pages/DataModelSegmentDetailPage"
  ).then(({ DataModelSegmentDetailPage }) => ({
    Component: DataModelSegmentDetailPage,
  }));

const segmentRevisionHistoryPage = () =>
  import(
    /* webpackChunkName: "data-model" */ "metabase/data-studio/segments/pages/DataModelSegmentRevisionHistoryPage"
  ).then(({ DataModelSegmentRevisionHistoryPage }) => ({
    Component: DataModelSegmentRevisionHistoryPage,
  }));

const segmentDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-model" */ "metabase/data-studio/segments/pages/DataModelSegmentDependenciesPage"
  ).then(({ DataModelSegmentDependenciesPage }) => ({
    Component: DataModelSegmentDependenciesPage,
  }));

const newMeasurePage = () =>
  import(
    /* webpackChunkName: "data-model" */ "metabase/data-studio/measures/pages/DataModelNewMeasurePage"
  ).then(({ DataModelNewMeasurePage }) => ({
    Component: DataModelNewMeasurePage,
  }));

const measureDetailPage = () =>
  import(
    /* webpackChunkName: "data-model" */ "metabase/data-studio/measures/pages/DataModelMeasureDetailPage"
  ).then(({ DataModelMeasureDetailPage }) => ({
    Component: DataModelMeasureDetailPage,
  }));

const measureRevisionHistoryPage = () =>
  import(
    /* webpackChunkName: "data-model" */ "metabase/data-studio/measures/pages/DataModelMeasureRevisionHistoryPage"
  ).then(({ DataModelMeasureRevisionHistoryPage }) => ({
    Component: DataModelMeasureRevisionHistoryPage,
  }));

const measureDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-model" */ "metabase/data-studio/measures/pages/DataModelMeasureDependenciesPage"
  ).then(({ DataModelMeasureDependenciesPage }) => ({
    Component: DataModelMeasureDependenciesPage,
  }));

export function getDataStudioMetadataRoutes(IsAdmin: ComponentType) {
  return (
    <>
      <Route index lazy={dataModel} />
      <Route path="database" lazy={dataModel} />
      <Route path="database/:databaseId" lazy={dataModel} />
      <Route path="database/:databaseId/schema/:schemaId" lazy={dataModel} />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        lazy={dataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/new"
        element={<IsAdmin />}
      >
        <Route index lazy={newSegmentPage} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId"
        lazy={segmentDetailPage}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/revisions"
        lazy={segmentRevisionHistoryPage}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/dependencies"
          lazy={segmentDependenciesPage}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/new"
        element={<IsAdmin />}
      >
        <Route index lazy={newMeasurePage} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId"
        lazy={measureDetailPage}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/revisions"
        lazy={measureRevisionHistoryPage}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/dependencies"
          lazy={measureDependenciesPage}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        element={redirect(
          "../database/:databaseId/schema/:schemaId/table/:tableId/details",
        )}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab"
        lazy={dataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId"
        lazy={dataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/settings"
        element={redirect(
          "../database/:databaseId/schema/:schemaId/table/:tableId/details",
        )}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
        element={redirect(
          "../database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId",
        )}
      />
    </>
  );
}
