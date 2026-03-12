import { jt, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Icon } from "metabase/ui";

import S from "./DeprecationNotice.module.css";

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
    <div className={S.NoticeRoot} role="status">
      <Icon name="warning" className={S.NoticeWarningIcon} />
      <div className={S.NoticeContent}>
        {getBannerContent(hasSlackBot, hasDeprecatedDatabase)}
      </div>
      <Icon name="close" className={S.NoticeCloseIcon} onClick={onClose} />
    </div>
  );
};

const getBannerContent = (
  hasSlackBot: boolean,
  hasDeprecatedDatabase: boolean,
) => {
  const databaseListUrl = "/admin/databases";
  const slackSettingsUrl = "/admin/settings/notifications";

  if (hasSlackBot && hasDeprecatedDatabase) {
    return jt`You’re using a ${(
      <Link
        variant="brandBold"
        key="database"
        to={databaseListUrl}
      >{t`Database driver`}</Link>
    )} and a ${(
      <Link
        variant="brandBold"
        key="slack"
        to={slackSettingsUrl}
      >{t`Slack bot integration`}</Link>
    )} which are now deprecated and will be removed in the next release. We recommend you ${(
      <strong key="upgrade">{t`upgrade`}</strong>
    )}.`;
  } else if (hasSlackBot) {
    return jt`Your Slack bot was deprecated but is still working. We recommend you delete the existing connection and ${(
      <Link
        variant="brandBold"
        key="slack"
        to={slackSettingsUrl}
      >{t`upgrade to Slack Apps`}</Link>
    )}.`;
  } else if (hasDeprecatedDatabase) {
    return jt`You’re using a ${(
      <Link
        variant="brandBold"
        key="database"
        to={databaseListUrl}
      >{t`Database driver`}</Link>
    )} which is now deprecated and will be removed in the next release. We recommend you ${(
      <strong key="upgrade">{t`upgrade`}</strong>
    )}.`;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeprecationNotice;
