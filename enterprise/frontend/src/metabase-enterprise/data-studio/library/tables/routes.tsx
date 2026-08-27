import type { ComponentType } from "react";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";

/**
 * The Data Studio library table pages, in one chunk. Every loader names it, so
 * moving between a table's overview, fields, segments and measures tabs does
 * not cost a fetch each time.
 *
 * The core data model routes load their own measure and segment pages from the
 * same two directories, under a chunk name of their own. See the note there for
 * why the two names stay apart.
 *
 * The admin guard stays eager: it has to decide before there is anything to
 * show.
 */
const tableOverviewPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "./pages/TableOverviewPage"
  ).then(({ TableOverviewPage }) => ({ Component: TableOverviewPage }));

const tableFieldsPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "./pages/TableFieldsPage"
  ).then(({ TableFieldsPage }) => ({ Component: TableFieldsPage }));

const tableSegmentsPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "./pages/TableSegmentsPage"
  ).then(({ TableSegmentsPage }) => ({ Component: TableSegmentsPage }));

const tableMeasuresPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "./pages/TableMeasuresPage"
  ).then(({ TableMeasuresPage }) => ({ Component: TableMeasuresPage }));

const tableDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "./pages/TableDependenciesPage"
  ).then(({ TableDependenciesPage }) => ({ Component: TableDependenciesPage }));

const newSegmentPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "metabase/data-studio/segments/pages/PublishedTableNewSegmentPage"
  ).then(({ PublishedTableNewSegmentPage }) => ({
    Component: PublishedTableNewSegmentPage,
  }));

const segmentDetailPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "metabase/data-studio/segments/pages/PublishedTableSegmentDetailPage"
  ).then(({ PublishedTableSegmentDetailPage }) => ({
    Component: PublishedTableSegmentDetailPage,
  }));

const segmentRevisionHistoryPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "metabase/data-studio/segments/pages/PublishedTableSegmentRevisionHistoryPage"
  ).then(({ PublishedTableSegmentRevisionHistoryPage }) => ({
    Component: PublishedTableSegmentRevisionHistoryPage,
  }));

const segmentDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "metabase/data-studio/segments/pages/PublishedTableSegmentDependenciesPage"
  ).then(({ PublishedTableSegmentDependenciesPage }) => ({
    Component: PublishedTableSegmentDependenciesPage,
  }));

const newMeasurePage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "metabase/data-studio/measures/pages/PublishedTableNewMeasurePage"
  ).then(({ PublishedTableNewMeasurePage }) => ({
    Component: PublishedTableNewMeasurePage,
  }));

const measureDetailPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "metabase/data-studio/measures/pages/PublishedTableMeasureDetailPage"
  ).then(({ PublishedTableMeasureDetailPage }) => ({
    Component: PublishedTableMeasureDetailPage,
  }));

const measureRevisionHistoryPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "metabase/data-studio/measures/pages/PublishedTableMeasureRevisionHistoryPage"
  ).then(({ PublishedTableMeasureRevisionHistoryPage }) => ({
    Component: PublishedTableMeasureRevisionHistoryPage,
  }));

const measureDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-tables" */ "metabase/data-studio/measures/pages/PublishedTableMeasureDependenciesPage"
  ).then(({ PublishedTableMeasureDependenciesPage }) => ({
    Component: PublishedTableMeasureDependenciesPage,
  }));

export function getDataStudioTableRoutes(IsAdmin: ComponentType) {
  return (
    <Route path="tables">
      <Route path=":tableId" lazy={tableOverviewPage} />
      <Route path=":tableId/fields" lazy={tableFieldsPage} />
      <Route path=":tableId/fields/:fieldId" lazy={tableFieldsPage} />
      <Route path=":tableId/segments" lazy={tableSegmentsPage} />
      <Route path=":tableId/segments/new" element={<IsAdmin />}>
        <Route index lazy={newSegmentPage} />
      </Route>
      <Route path=":tableId/segments/:segmentId" lazy={segmentDetailPage} />
      <Route
        path=":tableId/segments/:segmentId/revisions"
        lazy={segmentRevisionHistoryPage}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":tableId/segments/:segmentId/dependencies"
          lazy={segmentDependenciesPage}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":tableId/measures" lazy={tableMeasuresPage} />
      <Route path=":tableId/measures/new" element={<IsAdmin />}>
        <Route index lazy={newMeasurePage} />
      </Route>
      <Route path=":tableId/measures/:measureId" lazy={measureDetailPage} />
      <Route
        path=":tableId/measures/:measureId/revisions"
        lazy={measureRevisionHistoryPage}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":tableId/measures/:measureId/dependencies"
          lazy={measureDependenciesPage}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":tableId/dependencies" lazy={tableDependenciesPage}>
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
    </Route>
  );
}
