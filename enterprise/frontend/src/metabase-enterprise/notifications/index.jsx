import {
  PLUGIN_NOTIFICATION_COMPONENTS,
  PLUGIN_NOTIFICATION_SERVICE,
} from "metabase/plugins";

import { getNotificationRoutes } from "metabase-enterprise/notifications/routes";

Object.assign(PLUGIN_NOTIFICATION_COMPONENTS, {});

Object.assign(PLUGIN_NOTIFICATION_SERVICE, {
  getNotificationRoutes,
});
