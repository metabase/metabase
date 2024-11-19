import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import type { Alert, User } from "metabase-types/api";

type AlertCreatorTitleProps = {
  alert: Alert;
  user: User;
};

export const AlertCreatorTitle = ({ alert, user }: AlertCreatorTitleProps) => {
  const isAdmin = user.is_superuser;
  const isCurrentUser = alert.creator.id === user.id;
  const creator =
    alert.creator.id === user.id ? t`You` : alert.creator.common_name;
  const text =
    !isCurrentUser && !isAdmin
      ? t`You're receiving ${creator}'s alerts`
      : t`${creator} set up an alert`;

  return <h3 className={CS.textDark}>{text}</h3>;
};
