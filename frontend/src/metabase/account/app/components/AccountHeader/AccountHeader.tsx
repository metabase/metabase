import type { Path } from "history";
import { useMemo } from "react";
import Dropzone from "react-dropzone";
import { t } from "ttag";

import { useUploadImageMutation } from "metabase/api";
import Radio from "metabase/common/components/Radio";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { Box, Icon } from "metabase/ui";
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
    () => PLUGIN_IS_PASSWORD_USER.every((predicate) => predicate(user)),
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

  const [uploadImage] = useUploadImageMutation();

  const handleUpload = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];

      uploadImage({ file, userId: user.id });
    }
  };

  return (
    <AccountHeaderRoot data-testid="account-header">
      <HeaderSection>
        <Dropzone onDrop={handleUpload}>
          {({ getRootProps, getInputProps }) => (
            <Box
              {...getRootProps()}
              pos="relative"
              style={{ cursor: "pointer" }}
            >
              <input {...getInputProps()} />
              <Icon name="pencil" pos="absolute" right="-10px" bottom="20px" />
              <HeaderAvatar user={user} />
            </Box>
          )}
        </Dropzone>
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
