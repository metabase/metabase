import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { prepareInitials } from "metabase/common/utils/user";
import { getUser } from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import { logout } from "metabase/redux/auth";
import {
  ActionIcon,
  Avatar,
  Box,
  Divider,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import { AboutModal } from "../AboutModal/AboutModal";

import S from "./AppSwitcher.module.css";
import { HelpSubmenu, useAppMenuItems } from "./menu-items";
import { useGetCurrentApp } from "./useGetCurrentApp";

export const AppSwitcher = ({ className }: { className?: string }) => {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const dispatch = useDispatch();
  const user = useSelector(getUser);
  const currentApp = useGetCurrentApp();
  const appItems = useAppMenuItems();
  // Only the main app is available: no apps section, the avatar is the target
  const hasOtherApps = appItems.length > 1;

  return (
    <>
      <Menu position="bottom-end" shadow="sm" width={200} offset={9}>
        <Menu.Target>
          {hasOtherApps ? (
            <ActionIcon
              variant={currentApp === "admin" ? "on-dark-secondary" : "default"}
              radius="xl"
              aria-label={t`Settings`}
              className={className}
              data-testid="app-switcher-target"
            >
              <Icon name="mode" />
            </ActionIcon>
          ) : (
            <Avatar
              radius="lg"
              size={32}
              className={S.Avatar}
              bd="1px solid var(--mb-color-border-neutral)"
              data-testid="app-switcher-target"
            >
              {user ? prepareInitials(user) : "?"}
            </Avatar>
          )}
        </Menu.Target>
        <Menu.Dropdown w={320} px="0">
          {/* Avatar Stuff */}
          <Box px="lg">
            <Menu.Item
              component={ForwardRefLink}
              to={Urls.accountSettings()}
              data-testid="mode-switcher-profile-link"
            >
              <Group wrap="nowrap">
                <Avatar color="core-brand" radius="lg" size={32}>
                  {user ? prepareInitials(user) : "?"}
                </Avatar>
                <Stack gap="xxs">
                  <Text lh="xs">{user?.first_name}</Text>
                  <Text c="text-disabled" fz="md" lh="xs">
                    {user?.email}
                  </Text>
                </Stack>
              </Group>
            </Menu.Item>
          </Box>

          {/* Apps */}
          {hasOtherApps && (
            <>
              <Divider w="100%" my="sm" />
              <Box px="lg">{appItems}</Box>
            </>
          )}

          {/* Logout and Help */}
          <Divider w="100%" my="sm" />
          <Box px="lg">
            <HelpSubmenu onOpenAbout={() => setIsAboutOpen(true)} />
            <Menu.Item
              onClick={() => dispatch(logout())}
            >{t`Sign out`}</Menu.Item>
          </Box>
        </Menu.Dropdown>
      </Menu>

      <AboutModal onClose={() => setIsAboutOpen(false)} opened={isAboutOpen} />
    </>
  );
};
