import type { Path } from "history";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useUpdateUserAvatarMutation } from "metabase/api";
import { AvatarUpload } from "metabase/common/components/AvatarUpload";
import Radio from "metabase/common/components/Radio";
import { useSelector } from "metabase/lib/redux";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { getUser } from "metabase/selectors/user";
import { Box, Button, Icon, Modal, Stack, Text } from "metabase/ui";

import {
  AccountHeaderRoot,
  HeaderAvatar,
  HeaderSection,
  HeaderSubtitle,
  HeaderTitle,
} from "./AccountHeader.styled";

type AccountHeaderProps = {
  path?: string;
  onChangeLocation?: (nextLocation: Path) => void;
};

export const AccountHeader = ({
  path,
  onChangeLocation,
}: AccountHeaderProps) => {
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [updateUserAvatar] = useUpdateUserAvatarMutation();
  const user = useSelector(getUser);

  const hasPasswordChange = useMemo(
    () =>
      user
        ? PLUGIN_IS_PASSWORD_USER.every((predicate) => predicate(user))
        : false,
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

  const userFullName = user ? getFullName(user) : "";

  // Early return if user is not loaded yet
  if (!user) {
    return null;
  }

  const handleAvatarUpload = async (dataUri: string) => {
    try {
      await updateUserAvatar({
        id: user.id,
        avatar_url: dataUri,
      }).unwrap();

      setIsAvatarModalOpen(false);
    } catch (error) {
      console.error("Failed to update avatar:", error);
    }
  };

  const handleAvatarRemove = async () => {
    try {
      await updateUserAvatar({
        id: user.id,
        avatar_url: null,
      }).unwrap();
      setIsAvatarModalOpen(false);
    } catch (error) {
      console.error("Failed to remove avatar:", error);
    }
  };

  return (
    <AccountHeaderRoot data-testid="account-header">
      <HeaderSection>
        <Box style={{ position: "relative" }}>
          <HeaderAvatar user={user} />
          <Button
            size="xs"
            variant="subtle"
            c="text-medium"
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              borderRadius: "50%",
              width: "24px",
              height: "24px",
              minWidth: "24px",
              padding: 0,
            }}
            onClick={() => setIsAvatarModalOpen(true)}
            data-testid="edit-avatar-button"
          >
            <Icon name="pencil" size={12} />
          </Button>
        </Box>
        {userFullName && <HeaderTitle>{userFullName}</HeaderTitle>}
        <HeaderSubtitle>{user.email}</HeaderSubtitle>
      </HeaderSection>
      <Radio
        value={path}
        variant="underlined"
        options={tabs}
        onChange={onChangeLocation}
      />

      <Modal
        opened={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        title={t`Edit Avatar`}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm" c="text-medium">
            {t`Upload a profile picture. JPG, PNG, and WebP formats are supported. Maximum size is 2MB and 1200x1200 pixels.`}
          </Text>
          <AvatarUpload
            currentAvatarUrl={user.avatar_url}
            onUpload={handleAvatarUpload}
            onRemove={handleAvatarRemove}
            size="lg"
          />
        </Stack>
      </Modal>
    </AccountHeaderRoot>
  );
};
