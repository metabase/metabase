import { t } from "ttag";

import type { NotificationListItem } from "metabase/account/notifications/types";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import Settings from "metabase/lib/settings";
import type { User } from "metabase-types/api";

export const getCreatorMessage = (
  item: NotificationListItem["item"],
  user: User,
) => {
  let creatorString = "";
  const options = Settings.formattingOptions();

  if (user.id === item.creator?.id) {
    creatorString += t`Created by you`;
  } else if (item.creator?.common_name) {
    creatorString += t`Created by ${item.creator.common_name}`;
  } else {
    creatorString += t`Created`;
  }

  if (item.created_at) {
    const createdAt = formatDateTimeWithUnit(item.created_at, "day", options);
    creatorString += t` on ${createdAt}`;
  }

  return creatorString;
};
