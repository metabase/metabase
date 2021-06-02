import React from "react";
import { Route } from "metabase/hoc/Title";
import { t } from "ttag";

import NotificationsApp from "metabase-enterprise/notifications/components/NotificationsApp";
import RequestNotificationsApp from "metabase-enterprise/notifications/components/RequestNotificationsApp";

export function getNotificationRoutes() {
  return (
    <React.Fragment>
      <Route
        path="notifications"
        title={t`Notifications`}
        component={NotificationsApp}
      />
      <Route
        path="requests"
        title={t`Requests`}
        component={RequestNotificationsApp}
      />
    </React.Fragment>
  );
}
