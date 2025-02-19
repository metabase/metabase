import type { Path } from "history";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { UserAvatar } from "metabase/components/UserAvatar";
import Radio from "metabase/core/components/Radio";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { Box, Button, Flex, Icon, Indicator, Modal } from "metabase/ui";
import type { User } from "metabase-types/api";

import S from "./AccountHeader.module.css";
import {
  AccountHeaderRoot,
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
  const [modalOpen, setModalOpen] = useState(false);
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
        {/* <HeaderAvatar user={user} /> */}
        <Indicator
          label={<Icon name="pencil" />}
          size={30}
          offset={12}
          color="brand"
          classNames={{
            root: S.HoverTarget,
            indicator: S.ShowOnHover,
          }}
        >
          <UserAvatar
            mb="1rem"
            user={user}
            name={userFullName ?? undefined}
            color="brand"
            variant="filled"
            size="xl"
            mayor
            onClick={() => setModalOpen(true)}
          />
        </Indicator>
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
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        withCloseButton={false}
      >
        <Box>
          <Box
            bg="bg-medium"
            pos="absolute"
            w="100%"
            h="125px"
            top={0}
            left={0}
          />
          <Flex direction="column" align="center" pt="lg">
            <Box
              bg="bg-medium"
              p="sm"
              style={{ borderRadius: "100%" }}
              mb="1rem"
            >
              <UserAvatar
                user={user}
                name={userFullName ?? undefined}
                color="brand"
                variant="filled"
                size="7.5rem"
              />
            </Box>
            <Button variant="subtle" mb="1rem">
              Upload new image
            </Button>
            <Flex gap="1rem">
              <Button>Remove Image</Button>
              <Button>Use Initials</Button>
            </Flex>
          </Flex>
        </Box>
      </Modal>
    </AccountHeaderRoot>
  );
};
