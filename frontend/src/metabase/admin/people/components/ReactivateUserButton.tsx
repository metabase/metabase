import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
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
}) => (
  <Tooltip label={tooltipLabel}>
    <ForwardRefLink
      to={Urls.reactivateUser(user)}
      className={cx(S.refreshLink, { [S.disabled]: disabled })}
      onClick={(e) => (disabled ? e.preventDefault() : true)}
    >
      <Icon name="refresh" size={20} />
    </ForwardRefLink>
  </Tooltip>
);
