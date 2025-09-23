import { Route } from "metabase/hoc/Title";
import { BenchLayout } from "./BenchLayout";
import { BenchApp } from "./BenchApp";

export function getBenchRoutes() {
  return (
    <Route path="/bench" title="Metabase Bench" component={BenchLayout}>
      <Route path="*" component={BenchApp} />
    </Route>
  );
}
