import type { ReactNode } from "react";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

export function getBenchRoutes(): ReactNode {
  return (
    <Route
      title={t`Dependency graph`}
      path="dependencies"
      component={DependencyGraphPage}
    />
  );
}
