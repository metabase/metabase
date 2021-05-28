import {
  PLUGIN_NOTIFICATION_COMPONENTS,
  PLUGIN_NOTIFICATION_SERVICE,
} from "metabase/plugins";

import { getNotificationRoutes } from "metabase-enterprise/notifications/routes";
import NotificationCenterLink from "metabase-enterprise/notifications/components/NotificationCenterLink";

Object.assign(PLUGIN_NOTIFICATION_COMPONENTS, {
  NotificationCenterLink,
});

Object.assign(PLUGIN_NOTIFICATION_SERVICE, {
  getNotificationRoutes,
});
