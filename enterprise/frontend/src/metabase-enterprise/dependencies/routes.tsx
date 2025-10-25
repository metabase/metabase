import { t } from "ttag";

import { Route } from "metabase/hoc/Title";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

export function getDependencyRoutes() {
  return (
    <>
      <Route
        title={t`Dependencies`}
        path="dependencies"
        component={DependencyGraphPage}
      />
      <Route
        title={t`Dependencies`}
        path="dependencies/:entryType/:entryId"
        component={DependencyGraphPage}
      />
    </>
  );
}
