import { updateIn } from "icepick";
import { t } from "ttag";

import { LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { Route } from "metabase/hoc/Title";
import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_ADMIN_TROUBLESHOOTING,
} from "metabase/plugins";

import { QueryValidator } from "./components/QueryValidator";

PLUGIN_ADMIN_TROUBLESHOOTING.EXTRA_ROUTES = [
  <Route
    key="query-validator"
    path="query-validator"
    component={QueryValidator}
  />,
];

PLUGIN_ADMIN_TROUBLESHOOTING.GET_EXTRA_NAV = () => [
  <LeftNavPaneItem
    key="query-validator"
    name={t`Query Validator`}
    path="/admin/troubleshooting/query-validator"
  />,
];

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
  updateIn(sections, ["general", "settings"], settings => [
    ...settings,
    {
      key: "query-analysis-enabled",
      display_name: t`Enable query analysis`,
      type: "boolean",
    },
  ]),
);
