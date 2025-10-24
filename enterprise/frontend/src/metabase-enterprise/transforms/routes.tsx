import { IndexRoute } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";

import { JobEmptyPage } from "./pages/JobEmptyPage";
import { JobLayout } from "./pages/JobLayout/JobLayout";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import { NewTransformPage } from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformEmptyPage } from "./pages/TransformEmptyPage";
import { TransformLayout } from "./pages/TransformLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformTargetPage } from "./pages/TransformTargetPage";

export const getTransformRoutes = () => (
  <>
    <Route title={t`Transforms`} path="transforms" component={TransformLayout}>
      <IndexRoute component={TransformEmptyPage} />
      <Route path="new/:type" component={NewTransformPage} />
      <Route path="new/card/:cardId" component={NewTransformPage} />
      <Route path=":transformId" component={TransformQueryPage} />
      <Route path=":transformId/schedule" component={TransformRunPage} />
      <Route path=":transformId/target" component={TransformTargetPage} />
    </Route>
    <Route title={t`Jobs`} path="jobs" component={JobLayout}>
      <IndexRoute component={JobEmptyPage} />
      <Route path="new" component={NewJobPage} />
      <Route path=":jobId" component={JobPage} />
    </Route>
    <Route title={t`Runs`} path="runs" component={RunListPage} />
    {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
  </>
);
