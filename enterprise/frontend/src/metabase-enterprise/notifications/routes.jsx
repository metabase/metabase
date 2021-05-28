import React from "react";
import { IndexRoute } from "react-router";
import { Route } from "metabase/hoc/Title";
import { t } from "ttag";

import NotificationCenterApp from "metabase-enterprise/notifications/components/NotificationCenterApp";

export function getNotificationRoutes() {
  return (
    <Route path="notifications" title={t`Notifications`}>
      <IndexRoute component={NotificationCenterApp} />
    </Route>
  );
}
