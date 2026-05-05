import type { Path } from "history";
import { useMemo } from "react";
import { t } from "ttag";

import { Radio } from "metabase/common/components/Radio";
import { UserAvatar } from "metabase/common/components/UserAvatar";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { Box, Flex, Title, rem } from "metabase/ui";
import { getFullName } from "metabase/utils/user";
import type { User } from "metabase-types/api";

import S from "./AccountHeader.module.css";

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

  return (
    <Flex
      className={S.root}
      data-testid="account-header"
      direction="column"
      justify="center"
      align="center"
      bg="background-primary"
      pt={{ base: "sm", sm: "md" }}
    >
      <Flex direction="column" align="center" p={{ base: "md", md: rem(64) }}>
        <Box mb={{ base: "sm", sm: "md" }}>
          <UserAvatar user={user} className={S.avatar} />
        </Box>
        {userFullName && (
          <Title order={2} fz="md" ta="center" mb="xs">
            {userFullName}
          </Title>
        )}
        <Title order={3} fz="md" fw="normal" ta="center" c="text-secondary">
          {user.email}
        </Title>
      </Flex>
      <Radio
        value={path}
        variant="underlined"
        options={tabs}
        onChange={onChangeLocation}
      />
    </Flex>
  );
};
