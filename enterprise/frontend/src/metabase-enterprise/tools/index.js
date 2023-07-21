import { t } from "ttag";

import { Route } from "metabase/hoc/Title";

import { PLUGIN_ADMIN_TOOLS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import ErrorOverview from "./containers/ErrorOverview";
import ErrorDetail from "./containers/ErrorDetail";

if (hasPremiumFeature("audit_app")) {
  PLUGIN_ADMIN_TOOLS.INDEX_ROUTE = "errors";

  PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES_INFO = [
    {
      name: t`Questions`,
      value: "errors",
    },
  ];

  PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES = [
    <Route
      key="error-overview"
      path="errors"
      title={t`Erroring Questions`}
      component={ErrorOverview}
    />,
    <Route key="error-detail" path="errors/:cardId" component={ErrorDetail} />,
  ];
}
