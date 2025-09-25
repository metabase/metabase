import { IndexRedirect, Redirect, Route } from "react-router";

import { BenchApp } from "./BenchApp";
import { BenchLayout } from "./BenchLayout";
import { BenchOverview } from "./BenchOverview";
import { MetricsApp } from "./MetricsApp";
import { ModelsApp } from "./ModelsApp";
import { SegmentsApp } from "./SegmentsApp";
import { MetricsDetails } from "./components/MetricsDetails/MetricsDetails";
import { NewMetricPage } from "./components/NewMetricPage/NewMetricPage";
import { NewSegmentPage } from "./components/NewSegmentPage/NewSegmentPage";
import { SegmentsDetails } from "./components/SegmentsDetails/SegmentsDetails";
import { DataModel } from "./metadata/pages/DataModel/DataModel";

export function getBenchRoutes() {
  return (
    <Route path="/bench" component={BenchLayout}>
      <IndexRedirect to="overview" />
      <Route path="overview" component={BenchOverview} />
      <Route path="transforms" component={BenchApp} />
      <Route path="transform/:transformId" component={BenchApp} />
      <Route path="metadata">
        <Route>
          <IndexRedirect to="database" />
          <Route path="database" component={DataModel} />
          <Route path="database/:databaseId" component={DataModel} />
          <Route
            path="database/:databaseId/schema/:schemaId"
            component={DataModel}
          />
          <Route
            path="database/:databaseId/schema/:schemaId/table/:tableId"
            component={DataModel}
          />
          <Route
            path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
            component={DataModel}
          />
          <Redirect
            from="database/:databaseId/schema/:schemaId/table/:tableId/settings"
            to="database/:databaseId/schema/:schemaId/table/:tableId"
          />
          <Redirect
            from="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
            to="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
          />
        </Route>
      </Route>
      {/* SEGMENTS V2 - Tool layout with nested routes */}
      <Route path="segments" component={SegmentsApp}>
        <Route path="new" component={NewSegmentPage} />
        <Route path=":segmentId" component={SegmentsDetails} />
      </Route>

      {/* METRICS V2 */}
      <Route path="metrics" component={MetricsApp}>
        <Route path="new" component={NewMetricPage} />
        <Route path=":metricId" component={MetricsDetails} />
      </Route>

      {/* MODELS V2 */}
      <Route path="models" component={ModelsApp} />
    </Route>
  );
}
