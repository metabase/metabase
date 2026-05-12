import { jt, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Icon } from "metabase/ui";

import S from "./DeprecationNotice.module.css";

export interface DeprecationNoticeProps {
  hasDeprecatedDatabase: boolean;
  isEnabled: boolean;
  onClose: () => void;
}

const DeprecationNotice = ({
  hasDeprecatedDatabase,
  isEnabled,
  onClose,
}: DeprecationNoticeProps): JSX.Element | null => {
  if (!hasDeprecatedDatabase || !isEnabled) {
    return null;
  }

  const databaseListUrl = "/admin/databases";

  return (
    <div className={S.NoticeRoot} role="status">
      <Icon name="warning" className={S.NoticeWarningIcon} />
      <div className={S.NoticeContent}>
        {jt`You're using a ${(
          <Link
            variant="brandBold"
            key="database"
            to={databaseListUrl}
          >{t`Database driver`}</Link>
        )} which is now deprecated and will be removed in the next release. We recommend you ${(
          <strong key="upgrade">{t`upgrade`}</strong>
        )}.`}
      </div>
      <Icon name="close" className={S.NoticeCloseIcon} onClick={onClose} />
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeprecationNotice;
