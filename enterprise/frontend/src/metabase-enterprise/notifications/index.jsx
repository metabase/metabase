import {
  PLUGIN_NOTIFICATION_COMPONENTS,
  PLUGIN_NOTIFICATION_SERVICE,
} from "metabase/plugins";

import { getNotificationRoutes } from "metabase-enterprise/notifications/routes";
import NotificationsLink from "metabase-enterprise/notifications/components/NotificationsLink";

Object.assign(PLUGIN_NOTIFICATION_COMPONENTS, {
  NotificationsLink,
});

Object.assign(PLUGIN_NOTIFICATION_SERVICE, {
  getNotificationRoutes,
});
