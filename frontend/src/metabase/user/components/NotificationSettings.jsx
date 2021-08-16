import React from "react";
import { t } from "ttag";
import { EmptyIcon, EmptyMessage, EmptyRoot } from "./NotificationList.styled";

const NotificationSettings = () => {
  return <NotificationEmptyState />;
};

const NotificationEmptyState = () => {
  return (
    <EmptyRoot>
      <EmptyIcon />
      <EmptyMessage>
        {t`If you subscribe or are added to dashboard subscriptions or alerts
        you’ll be able to manage those here.`}
      </EmptyMessage>
    </EmptyRoot>
  );
};

export default NotificationSettings;
