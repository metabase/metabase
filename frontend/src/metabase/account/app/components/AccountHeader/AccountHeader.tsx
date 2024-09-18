import type { Path } from "history";
import { type ChangeEvent, useMemo, useRef } from "react";
import { t } from "ttag";

import { useUpdateUserMutation } from "metabase/api";
import Radio from "metabase/core/components/Radio";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { Box } from "metabase/ui";
import type { User } from "metabase-types/api";

import AccountHeaderStyle from "./AccountHeader.module.css";
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [updateUser] = useUpdateUserMutation();
  function handleAvatarUpload(fileEvent: ChangeEvent<HTMLInputElement>) {
    if (fileEvent.target.files && fileEvent.target.files.length > 0) {
      const file = fileEvent.target.files[0];

      const reader = new FileReader();
      reader.onload = async readerEvent => {
        const dataUri = readerEvent.target?.result as string;
        updateUser({
          id: user.id,
          avatar: dataUri,
        });
      };
      reader.readAsDataURL(file);
    }
  }

  return (
    <AccountHeaderRoot data-testid="account-header">
      <HeaderSection>
        <Box
          pos="relative"
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          <HeaderAvatar user={user} />
          <div className={AccountHeaderStyle.uploadIcon}>+</div>
        </Box>
        <input
          data-testid="file-input"
          ref={fileInputRef}
          hidden
          onChange={handleAvatarUpload}
          type="file"
          accept="image/jpeg,image/png,image/svg+xml"
          multiple={false}
        />
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
