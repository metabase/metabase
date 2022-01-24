import React from "react";
import { jt, t } from "ttag";
import {
  NoticeCloseIcon,
  NoticeContent,
  NoticeLink,
  NoticeRoot,
  NoticeWarningIcon,
} from "./DeprecationNotice.styled";

export interface DeprecationNoticeProps {
  hasSlackBot: boolean;
  hasDeprecatedDatabase: boolean;
  isEnabled: boolean;
  onClose: () => void;
}

const DeprecationNotice = ({
  hasSlackBot,
  hasDeprecatedDatabase,
  isEnabled,
  onClose,
}: DeprecationNoticeProps): JSX.Element | null => {
  if ((!hasSlackBot && !hasDeprecatedDatabase) || !isEnabled) {
    return null;
  }

  return (
    <NoticeRoot role="status">
      <NoticeWarningIcon name="warning" />
      <NoticeContent>
        {getBannerContent(hasSlackBot, hasDeprecatedDatabase)}
      </NoticeContent>
      <NoticeCloseIcon name="close" onClick={onClose} />
    </NoticeRoot>
  );
};

const getBannerContent = (
  hasSlackBot: boolean,
  hasDeprecatedDatabase: boolean,
) => {
  const databaseListUrl = "/admin/databases";
  const slackSettingsUrl = "/admin/settings/slack";

  if (hasSlackBot && hasDeprecatedDatabase) {
    return jt`You’re using a ${(
      <NoticeLink
        key="database"
        to={databaseListUrl}
      >{t`Database driver`}</NoticeLink>
    )} and a ${(
      <NoticeLink
        key="slack"
        to={slackSettingsUrl}
      >{t`Slack bot integration`}</NoticeLink>
    )} which are now deprecated and will be removed in the next release. We recommend you ${(
      <strong key="upgrade">{t`upgrade`}</strong>
    )}.`;
  } else if (hasSlackBot) {
    return jt`Your Slack bot was deprecated but is still working. We recommend you delete the existing connection and ${(
      <NoticeLink
        key="slack"
        to={slackSettingsUrl}
      >{t`upgrade to Slack Apps`}</NoticeLink>
    )}.`;
  } else if (hasDeprecatedDatabase) {
    return jt`You’re using a ${(
      <NoticeLink
        key="database"
        to={databaseListUrl}
      >{t`Database driver`}</NoticeLink>
    )} which is now deprecated and will be removed in the next release. We recommend you ${(
      <strong key="upgrade">{t`upgrade`}</strong>
    )}.`;
  }
};

export default DeprecationNotice;
