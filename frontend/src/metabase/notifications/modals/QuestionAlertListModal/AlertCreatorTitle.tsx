import dayjs from "dayjs";
import { t } from "ttag";

import { Text } from "metabase/ui";
import type { Notification, User } from "metabase-types/api";

type AlertCreatorTitleProps = {
  alert: Notification;
  user: User;
};

export const AlertCreatorTitle = ({ alert, user }: AlertCreatorTitleProps) => {
  const creator =
    alert.creator.id === user.id ? t`you` : alert.creator.common_name;
  const dateString = dayjs(alert.created_at).format("MMM D, YYYY");

  return (
    <Text
      c="inherit"
      size="sm"
    >{t`Created by ${creator} at, ${dateString}`}</Text>
  );
};
