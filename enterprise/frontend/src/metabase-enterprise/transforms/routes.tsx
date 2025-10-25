import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createBenchAdminRouteGuard } from "metabase/bench/components/utils";
import type { BenchNavItem } from "metabase/bench/constants/navigation";
import { Route } from "metabase/hoc/Title";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";

import { JobEmptyPage } from "./pages/JobEmptyPage";
import { JobLayout } from "./pages/JobLayout/JobLayout";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import { NewTransformPage } from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformDependenciesPage } from "./pages/TransformDependenciesPage";
import { TransformEmptyPage } from "./pages/TransformEmptyPage";
import { TransformLayout } from "./pages/TransformLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformTargetPage } from "./pages/TransformTargetPage";

export const getTransformNavItems = (isAdmin: boolean): BenchNavItem[] => {
  if (!isAdmin) {
    return [];
  }

  return [
    {
      id: "transforms",
      url: "/bench/transforms",
      icon: "transform",
      getLabel: () => t`Transforms`,
      getDescription: () =>
        t`Use SQL or python to join data and add columns. Run them on a schedule with jobs.`,
    },
    {
      id: "jobs",
      url: "/bench/jobs",
      icon: "play_outlined",
      getLabel: () => t`Jobs`,
      parentId: "transforms",
      nested: true,
    },
    {
      id: "runs",
      url: "/bench/runs",
      icon: "list",
      getLabel: () => t`Runs`,
      parentId: "transforms",
      nested: true,
    },
  ];
};

export const getTransformRoutes = () => (
  <>
    <Route
      title={t`Transforms`}
      path="transforms"
      component={createBenchAdminRouteGuard("transforms", TransformLayout)}
    >
      <IndexRoute component={TransformEmptyPage} />
      <Route path="new/:type" component={NewTransformPage} />
      <Route path="new/card/:cardId" component={NewTransformPage} />
      <Route path=":transformId" component={TransformQueryPage} />
      <Route path=":transformId/run" component={TransformRunPage} />
      <Route path=":transformId/target" component={TransformTargetPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":transformId/dependencies"
          component={TransformDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
    <Route
      title={t`Jobs`}
      path="jobs"
      component={createBenchAdminRouteGuard("transforms", JobLayout)}
    >
      <IndexRoute component={JobEmptyPage} />
      <Route path="new" component={NewJobPage} />
      <Route path=":jobId" component={JobPage} />
    </Route>
    <Route
      title={t`Runs`}
      path="runs"
      component={createBenchAdminRouteGuard("transforms", RunListPage)}
    />
    {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
  </>
);
