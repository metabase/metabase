import type { Path } from "history";
import { useMemo } from "react";
import { t } from "ttag";

import Radio from "metabase/core/components/Radio";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import type { User } from "metabase-types/api";

import {
  AccountHeaderRoot,
  HeaderAvatar,
  HeaderSection,
  HeaderSubtitle,
  HeaderTitle,
} from "./AccountHeader.styled";

type AccountHeaderProps = {
  user: User;
  path?: string;
  onChangeLocation?: (nextLocation: Path) => void;
};

export const AccountHeader = ({
  user,
  path,
  onChangeLocation,
}: AccountHeaderProps) => {
  const hasPasswordChange = useMemo(
    () => PLUGIN_IS_PASSWORD_USER.every(predicate => predicate(user)),
    [user],
  );

  const tabs = useMemo(
    () => [
      { name: t`Profile`, value: "/account/profile" },
      ...(hasPasswordChange
        ? [{ name: t`Password`, value: "/account/password" }]
        : []),
      { name: t`Login History`, value: "/account/login-history" },
      { name: t`Notifications`, value: "/account/notifications" },
    ],
    [hasPasswordChange],
  );

  const userFullName = getFullName(user);

  return (
    <AccountHeaderRoot data-testid="account-header">
      <HeaderSection>
        <HeaderAvatar user={user} />
        {userFullName && <HeaderTitle>{userFullName}</HeaderTitle>}
        <HeaderSubtitle>{user.email}</HeaderSubtitle>
      </HeaderSection>
      <Radio
        value={path}
        variant="underlined"
        options={tabs}
        onChange={onChangeLocation}
      />
    </AccountHeaderRoot>
  );
};
