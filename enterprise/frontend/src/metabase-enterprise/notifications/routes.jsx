import React from "react";
import { Route } from "metabase/hoc/Title";
import { t } from "ttag";

import RequestNotificationsApp from "metabase-enterprise/notifications/components/RequestNotificationsApp";
import NotificationsApp from "metabase-enterprise/notifications/components/NotificationsApp";

export function getNotificationRoutes() {
  return (
    <React.Fragment>
      <Route
        path="requests"
        title={t`Requests`}
        component={RequestNotificationsApp}
      />
      <Route
        path="notifications"
        title={t`Notifications`}
        component={NotificationsApp}
      />
    </React.Fragment>
  );
}
