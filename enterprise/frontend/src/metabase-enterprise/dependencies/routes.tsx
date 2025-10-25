import type { ReactNode } from "react";
import { t } from "ttag";

import type { BenchNavItem } from "metabase/bench/constants/navigation";
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

export const getBenchNavItems = (): BenchNavItem[] => {
  return [
    {
      id: "dependencies",
      url: "/bench/dependencies",
      icon: "network",
      getLabel: () => t`Dependency graph`,
      getDescription: () =>
        t`Use the Dependency Graph to see what's upstream and downstream of anything.`,
    },
  ];
};
