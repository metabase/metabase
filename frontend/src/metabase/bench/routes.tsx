import { IndexRedirect } from "react-router";
import { Route } from "metabase/hoc/Title";
import { BenchLayout } from "./BenchLayout";
import { ExamplePage1, ExamplePage2 } from "./pages";

export function getBenchRoutes() {
  return (
    <Route path="/bench" component={BenchLayout}>
      <IndexRedirect to="/bench/page1" />
      <Route path="page1" title="Bench - Example Page 1" component={ExamplePage1} />
      <Route path="page2" title="Bench - Example Page 2" component={ExamplePage2} />
    </Route>
  );
}
