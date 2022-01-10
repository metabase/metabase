import React from "react";
import { jt, t } from "ttag";
import {
  BannerCloseIcon,
  BannerContent,
  BannerLink,
  BannerRoot,
  BannerWarningIcon,
} from "./DeprecationBanner.styled";

export interface DeprecationBannerProps {
  hasSlackBot: boolean;
  hasDeprecatedDatabase: boolean;
  isEnabled: boolean;
  onClose: () => void;
}

const DeprecationBanner = ({
  hasSlackBot,
  hasDeprecatedDatabase,
  isEnabled,
  onClose,
}: DeprecationBannerProps): JSX.Element | null => {
  if ((!hasSlackBot && !hasDeprecatedDatabase) || !isEnabled) {
    return null;
  }

  return (
    <BannerRoot>
      <BannerWarningIcon name="warning" />
      <BannerContent>
        {getBannerContent(hasSlackBot, hasDeprecatedDatabase)}
      </BannerContent>
      <BannerCloseIcon name="close" onClick={onClose} />
    </BannerRoot>
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
      <BannerLink
        key="database"
        to={databaseListUrl}
      >{t`Database driver`}</BannerLink>
    )} and a ${(
      <BannerLink
        key="slack"
        to={slackSettingsUrl}
      >{t`Slack bot integration`}</BannerLink>
    )} which are now deprecated and will be removed in the next release. We recommend you ${(
      <strong key="upgrade">{t`upgrade`}</strong>
    )}.`;
  } else if (hasSlackBot) {
    return jt`Your Slack bot was deprecated but is still working. We recommend you ${(
      <BannerLink
        key="slack"
        to={slackSettingsUrl}
      >{t`upgrade to Slack Apps`}</BannerLink>
    )} when you get a chance.`;
  } else if (hasDeprecatedDatabase) {
    return jt`You’re using a ${(
      <BannerLink
        key="database"
        to={databaseListUrl}
      >{t`Database driver`}</BannerLink>
    )} which is now deprecated and will be removed in the next release. We recommend you ${(
      <strong key="upgrade">{t`upgrade`}</strong>
    )}.`;
  }
};

export default DeprecationBanner;
