import { useMemo } from "react";
import { t } from "ttag";

import { hasAuthenticationSettings } from "metabase/account/utils";
import { UserAvatar } from "metabase/common/components/UserAvatar";
import { useSetting } from "metabase/settings";
import { Box, Flex, Tabs, Title, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getFullName } from "metabase/utils/user";
import type { User } from "metabase-types/api";

import S from "./AccountHeader.module.css";

type AccountHeaderProps = {
  user: User;
  path?: string;
  onChangeLocation?: (nextLocation: string) => void;
};

export const AccountHeader = ({
  user,
  path,
  onChangeLocation,
}: AccountHeaderProps) => {
  const mfaEnforcement = useSetting("mfa-enforcement");
  const hasAuthenticationTab = hasAuthenticationSettings(user, mfaEnforcement);

  const tabs = useMemo(
    () => [
      { name: t`Profile`, value: Urls.accountSettings() },
      ...(hasAuthenticationTab
        ? [{ name: t`Authentication`, value: Urls.accountAuthentication() }]
        : []),
      { name: t`Login History`, value: Urls.accountLoginHistory() },
      { name: t`Notifications`, value: Urls.accountNotifications() },
    ],
    [hasAuthenticationTab],
  );

  const userFullName = getFullName(user);

  return (
    <Flex
      data-testid="account-header"
      direction="column"
      justify="center"
      align="center"
      bg="background_page-primary"
      pt={{ base: "sm", sm: "lg" }}
    >
      <Flex direction="column" align="center" p={{ base: "lg", md: rem(64) }}>
        <Box mb={{ base: "sm", sm: "lg" }}>
          <UserAvatar user={user} className={S.avatar} />
        </Box>
        {userFullName && (
          <Title order={2} fz="md" ta="center" mb="xxs">
            {userFullName}
          </Title>
        )}
        <Title order={3} fz="md" fw="normal" ta="center" c="text-secondary">
          {user.email}
        </Title>
      </Flex>
      <Tabs
        listBorder={false}
        value={path ?? null}
        onChange={(value) => value && onChangeLocation?.(value)}
      >
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value}>
              {tab.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </Flex>
  );
};
