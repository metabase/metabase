import { t } from "ttag";
import {
  PLUGIN_ADMIN_NAV_ITEMS,
  PLUGIN_ADMIN_ROUTES,
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_REDUCERS,
  PLUGIN_DASHBOARD_HEADER,
  PLUGIN_QUERY_BUILDER_HEADER,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import getAuditRoutes, { getUserMenuRotes } from "./routes";
import { auditInfo } from "./reducer";
import { getDashboardOverviewId, getQuestionOverviewId } from "./selectors";

import { InstanceAnalyticsButton } from "./components/InstanceAnalyticsButton/InstanceAnalyticsButton";

if (hasPremiumFeature("audit_app")) {
  PLUGIN_ADMIN_NAV_ITEMS.push({
    name: t`Audit`,
    path: "/admin/audit",
    key: "audit",
  });
  PLUGIN_ADMIN_ROUTES.push(getAuditRoutes);

  PLUGIN_ADMIN_USER_MENU_ITEMS.push(user => [
    {
      title: t`Unsubscribe from all subscriptions / alerts`,
      link: `/admin/people/${user.id}/unsubscribe`,
    },
  ]);

  PLUGIN_ADMIN_USER_MENU_ROUTES.push(getUserMenuRotes);

  PLUGIN_REDUCERS.auditInfo = auditInfo;

  PLUGIN_DASHBOARD_HEADER.extraButtons = dashboard => {
    return [
      {
        key: "Usage insights",
        component: (
          <InstanceAnalyticsButton
            entitySelector={getDashboardOverviewId}
            linkQueryParams={{ dashboard_id: dashboard.id }}
          />
        ),
      },
    ];
  };

  PLUGIN_QUERY_BUILDER_HEADER.extraButtons = question => {
    return [
      {
        key: "Usage insights",
        component: (
          <InstanceAnalyticsButton
            entitySelector={getQuestionOverviewId}
            linkQueryParams={{ question_id: question.id() }}
          />
        ),
      },
    ];
  };
}
