import { t } from "ttag";
import {
  PLUGIN_ADMIN_NAV_ITEMS,
  PLUGIN_ADMIN_ROUTES,
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_INSTANCE_ANALYTICS,
} from "metabase/plugins";
import { GET } from "metabase/lib/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import getAuditRoutes, { getUserMenuRotes } from "./routes";

const getAuditInfo = GET("/api/ee/audit-app/user/audit-info");

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

  getAuditInfo().then(data => {
    const { question_overview, dashboard_overview } = data;

    if (dashboard_overview !== undefined) {
      PLUGIN_INSTANCE_ANALYTICS.dashboardAuditLink = (dashboard, push) => [
        {
          title: t`Usage insights`,
          icon: "audit",
          action: () => {
            push({
              pathname: `/dashboard/${dashboard_overview}`,
              query: {
                dashboard_id: dashboard.id.toString(),
              },
            });
          },
        },
      ];
    }

    if (question_overview !== undefined) {
      PLUGIN_INSTANCE_ANALYTICS.questionAuditLink = (question, push) => [
        {
          title: t`Usage insights`,
          icon: "audit",
          action: () => {
            push({
              pathname: `/dashboard/${question_overview}`,
              query: {
                question_id: question.id(),
              },
            });
          },
        },
      ];
    }
  });
}
