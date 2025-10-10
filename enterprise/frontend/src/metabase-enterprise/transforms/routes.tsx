
import { IndexRoute } from "react-router";
import { t } from "ttag";

import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Center } from "metabase/ui";

import { JobsLayout, TransformLayout } from "./TransformLayouts";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import { NewTransformPage } from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformPage } from "./pages/TransformPage";

const EmptyBoat = () => <Center w="100%" h="100%"><NoDataError  /></Center>;

export const getTransformRoutes = () => (
  <>
    <Route path="runs" component={RunListPage} />
    <Route path="jobs"component={JobsLayout}>
      <IndexRoute component={EmptyBoat} />
      <Route path="new" component={NewJobPage} />
      <Route path=":jobId" component={JobPage} />
    </Route>
    <Route path="transforms">
      <Route title={t`Transforms`} component={TransformLayout}>
        <IndexRoute component={EmptyBoat} />
        <Route path="new/:type" component={NewTransformPage} />
        <Route path="new/card/:cardId" component={NewTransformPage} />
        <Route path=":transformId" component={TransformPage} />
      </Route>
    </Route>
    {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
  </>
);
