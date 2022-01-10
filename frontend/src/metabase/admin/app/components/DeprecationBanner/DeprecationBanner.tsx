import React from "react";
import { jt, t } from "ttag";
import * as Urls from "metabase/lib/urls";
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
  const slackSettingsUrl = Urls.slackSettings();
  const databaseListUrl = Urls.listDatabases();

  if (hasSlackBot && hasDeprecatedDatabase) {
    return jt`You’re using a ${(
      <BannerLink to={databaseListUrl}>{t`Database driver`}</BannerLink>
    )} and a ${(
      <BannerLink to={slackSettingsUrl}>{t`Slack bot integration`}</BannerLink>
    )} which are now deprecated and will be removed in the next release. We recommend you ${(
      <strong>{t`upgrade`}</strong>
    )}.`;
  } else if (hasSlackBot) {
    return jt`Your Slack bot was deprecated but is still working. We recommend you ${(
      <BannerLink to={slackSettingsUrl}>{t`upgrade to Slack Apps`}</BannerLink>
    )} when you get a chance.`;
  } else if (hasDeprecatedDatabase) {
    return jt`You’re using a ${(
      <BannerLink to={databaseListUrl}>{t`Database driver`}</BannerLink>
    )} which is now deprecated and will be removed in the next release. We recommend you ${(
      <strong>{t`upgrade`}</strong>
    )}.`;
  }
};

export default DeprecationBanner;
