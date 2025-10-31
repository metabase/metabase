import type { ReactNode } from "react";
import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { BenchLayout } from "./pages/BenchLayout";
import { DataSectionLayout } from "./pages/DataSectionLayout";

function Placeholder({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function getBenchRoutes() {
  return (
    <Route path="bench" component={BenchLayout}>
      <Route path="data" component={DataSectionLayout} />
      {/* sidebar  */}
      <Route path="transforms" component={Placeholder}>
        <IndexRoute component={Placeholder} />
        <Route path="jobs" component={Placeholder} />
        <Route path="runs" component={Placeholder} />
      </Route>
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="dependencies"
          component={PLUGIN_DEPENDENCIES.DependencyGraphPage}
        />
      )}
    </Route>
  );
}
