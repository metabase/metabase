import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createBenchAdminRouteGuard } from "metabase/bench/components/utils";
import type { BenchNavItem } from "metabase/bench/constants/navigation";
import { Route } from "metabase/hoc/Title";
import * as Urls from "metabase/lib/urls";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";

import { JobEmptyPage } from "./pages/JobEmptyPage";
import { JobLayout } from "./pages/JobLayout/JobLayout";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import {
  NewCardTransformPage,
  NewNativeTransformPage,
  NewPythonTransformPage,
  NewQueryTransformPage,
} from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformDependenciesPage } from "./pages/TransformDependenciesPage";
import { TransformEmptyPage } from "./pages/TransformEmptyPage";
import { TransformLayout } from "./pages/TransformLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformTargetPage } from "./pages/TransformTargetPage";

export const getBenchRoutes = () => (
  <>
    <Route
      title={t`Transforms`}
      path="transforms"
      component={createBenchAdminRouteGuard("transforms", TransformLayout)}
    >
      <IndexRoute component={TransformEmptyPage} />
      <Route path="new/query" component={NewQueryTransformPage} />
      <Route path="new/native" component={NewNativeTransformPage} />
      <Route path="new/card/:cardId" component={NewCardTransformPage} />
      {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
        <Route path="new/python" component={NewPythonTransformPage} />
      )}
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
  </>
);

export const getBenchNavItems = (isAdmin: boolean): BenchNavItem[] => {
  if (!isAdmin) {
    return [];
  }

  return [
    {
      id: "transforms",
      url: Urls.transformList(),
      icon: "transform",
      getLabel: () => t`Transforms`,
      getDescription: () =>
        t`Use SQL or python to join data and add columns. Run them on a schedule with jobs.`,
    },
    {
      id: "jobs",
      url: Urls.transformJobList(),
      icon: "play_outlined",
      getLabel: () => t`Jobs`,
      parentId: "transforms",
      nested: true,
    },
    {
      id: "runs",
      url: Urls.transformRunList(),
      icon: "list",
      getLabel: () => t`Runs`,
      parentId: "transforms",
      nested: true,
    },
  ];
};
