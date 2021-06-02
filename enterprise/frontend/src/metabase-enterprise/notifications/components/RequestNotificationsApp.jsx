import React from "react";

import NotificationSectionHeader from "./NotificationSectionHeader";
import RequestNotificationCard from "./RequestNotificationCard";
import { ListContainer } from "./RequestNotificationsApp.styled";

RequestNotifications.propTypes = {};

function RequestNotifications() {
  return (
    <div>
      <NotificationSectionHeader />
      <ListContainer>
        <RequestNotificationCard />
        <RequestNotificationCard />
        <RequestNotificationCard />
      </ListContainer>
    </div>
  );
}

export default RequestNotifications;
