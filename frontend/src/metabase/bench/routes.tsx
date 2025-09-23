import { Route, IndexRoute } from "react-router";
import { BenchLayout } from "./BenchLayout";
import { BenchApp } from "./BenchApp";

export function getBenchRoutes() {
  return (
    <Route path="/bench" title="Metabase Bench" component={BenchLayout}>
      <IndexRoute component={BenchApp} />
      <Route
        path="transform/:transformId"
        title="Transform - Metabase Bench"
        component={BenchApp}
      />
    </Route>
  );
}
