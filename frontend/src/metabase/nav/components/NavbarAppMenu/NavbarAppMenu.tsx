import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useDispatch, useSelector } from "metabase/redux";
import { logout } from "metabase/redux/auth";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Group, Icon, Menu, Text, UnstyledButton } from "metabase/ui";
import * as Urls from "metabase/urls";

import { AboutModal } from "../AboutModal/AboutModal";
import { HelpSubmenu, useAppMenuItems } from "../AppSwitcher";

import S from "./NavbarAppMenu.module.css";

interface NavbarAppMenuProps {
  isLogoVisible?: boolean;
}

/**
 * Logo and application name; opens a menu for switching between apps, plus
 * account, help and sign out.
 */
export function NavbarAppMenu({ isLogoVisible = true }: NavbarAppMenuProps) {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const dispatch = useDispatch();
  const applicationName = useSelector(getApplicationName);
  const appItems = useAppMenuItems();

  return (
    <>
      <Menu position="bottom-start" shadow="sm" width={240}>
        <Menu.Target>
          <UnstyledButton
            className={S.target}
            aria-label={t`Switch app`}
            data-testid="main-logo-link"
          >
            <Group gap="sm" wrap="nowrap">
              {isLogoVisible && <LogoIcon height={28} />}
              <Text fw={700} fz="lg" lh={1} truncate>
                {applicationName}
              </Text>
              <Icon name="chevrondown" size={10} c="text-secondary" />
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {appItems}
          <Menu.Divider />
          <Menu.Item
            component={ForwardRefLink}
            to={Urls.accountSettings()}
            leftSection={<Icon name="person" />}
          >
            {t`Account`}
          </Menu.Item>
          <HelpSubmenu
            icon="question"
            position="right-start"
            offset={8}
            onOpenAbout={() => setIsAboutOpen(true)}
          />
          <Menu.Item
            leftSection={<Icon name="exit" />}
            onClick={() => dispatch(logout())}
          >
            {t`Sign out`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <AboutModal onClose={() => setIsAboutOpen(false)} opened={isAboutOpen} />
    </>
  );
}
