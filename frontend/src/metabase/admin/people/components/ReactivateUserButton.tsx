import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useUserUrls } from "metabase/common/tenants";
import { Icon, Tooltip } from "metabase/ui";
import type { User } from "metabase-types/api";

import S from "./ReactivateUserButton.module.css";

export const ReactivateUserButton = ({
  user,
  disabled = false,
  tooltipLabel = t`Reactivate this account`,
}: {
  user: User;
  disabled?: boolean;
  tooltipLabel?: string;
}) => {
  const userUrls = useUserUrls();

  return (
    <Tooltip label={tooltipLabel}>
      <ForwardRefLink
        to={userUrls.reactivateUser(user)}
        className={cx(S.refreshLink, { [S.disabled]: disabled })}
        onClick={(e) => (disabled ? e.preventDefault() : true)}
      >
        <Icon name="refresh" size={20} />
      </ForwardRefLink>
    </Tooltip>
  );
};
