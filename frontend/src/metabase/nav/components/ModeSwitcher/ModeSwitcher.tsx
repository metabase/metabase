import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { logout } from "metabase/auth/actions";
import { ErrorDiagnosticModalWrapper } from "metabase/common/components/ErrorPages/ErrorDiagnosticModal";
import { trackErrorDiagnosticModalOpened } from "metabase/common/components/ErrorPages/analytics";
import { ForwardRefLink } from "metabase/common/components/Link";
import LogoIcon from "metabase/common/components/LogoIcon";
import Modal from "metabase/common/components/Modal";
import { useSetting } from "metabase/common/hooks";

import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/home/selectors";
import { capitalize } from "metabase/lib/formatting";
import { connect, useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { openDiagnostics } from "metabase/redux/app";
import { setOpenModal } from "metabase/redux/ui";
import {
  getApplicationName,
  getIsWhiteLabeling,
} from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Avatar,
  Divider,
  Group,
  Icon,
  type IconName,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { MetabaseInfo } from "metabase-types/api";
import type { AdminPath, State } from "metabase-types/store";

import { useHelpLink } from "../ProfileLink/useHelpLink";
import { AboutModal } from "../AboutModal/AboutModal";
import { Box, MenuItem } from "@mantine/core";

// generate the proper set of list items for the current user
// based on whether they're an admin or not
const mapStateToProps = (state: State) => ({
  adminItems: getAdminPaths(state),
  canAccessOnboardingPage: getCanAccessOnboardingPage(state),
  canAccessDataStudio: PLUGIN_DATA_STUDIO.canAccessDataStudio(state),
  isNewInstance: getIsNewInstance(state),
});

const mapDispatchToProps = {
  onOpenDiagnostics: openDiagnostics,
  onLogout: logout,
};

interface ProfileLinkProps {
  adminItems: AdminPath[];
  canAccessOnboardingPage: boolean;
  canAccessDataStudio: boolean;
  isNewInstance: boolean;
  onOpenDiagnostics: () => void;
  onLogout: () => void;
}

interface MenuItem {
  title?: string;
  icon?: IconName | null;
  externalLink?: boolean;
  link?: string;
  action?: () => void;
  separator?: boolean;
}

function ProfileLinkInner({
  adminItems,
  canAccessOnboardingPage,
  canAccessDataStudio,
  isNewInstance,
  onLogout,
  onOpenDiagnostics,
}: ProfileLinkProps) {
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const dispatch = useDispatch();

  const openModal = (modalName: string) => {
    setModalOpen(modalName);
  };

  const closeModal = () => {
    setModalOpen(null);
  };

  return (
    <>
      <Menu position="bottom-end" shadow="md" width={200}>
        <Menu.Target>
          <ActionIcon
            size="2.25rem"
            p="sm"
            variant="outline"
            color="text-primary"
            bd="1px solid var(--mb-color-border)"
            aria-label={t`Settings`}
            bdrs="50%"
          >
            <Icon name="mode" c="text-secondary" size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown w={320} bd="none" px="0">
          {/* Avatar Stuff */}
          <Box px="md">
            <Menu.Item>
              <Group wrap="nowrap">
                <Avatar color="brand" radius="lg">
                  NP
                </Avatar>
                <Stack gap={0}>
                  <Text>Nick</Text>
                  <Text c="text-tertiary" fz="md">
                    nick.fitz@metabase.com
                  </Text>
                </Stack>
              </Group>
            </Menu.Item>
          </Box>

          <Divider w="100%" my="sm" />

          {/* Apps */}
          <Box px="md">
            <Menu.Item
              component={ForwardRefLink}
              to="/"
              leftSection={<Icon name="check_filled" c="brand" />}
            >
              {t`Main app`}
            </Menu.Item>
            <Menu.Item
              component={ForwardRefLink}
              to={Urls.dataStudio()}
              leftSection={<Icon name="table" />}
            >
              {t`Data studio`}
            </Menu.Item>
            <Menu.Item
              component={ForwardRefLink}
              to={"/admin"}
              leftSection={<Icon name="io" />}
            >{t`Admin`}</Menu.Item>
          </Box>
          <Divider w="100%" my="sm" />
          <Box px="md">
            <Menu.Sub position="left-start" offset={28} closeDelay={500}>
              <Menu.Sub.Target>
                <Menu.Sub.Item>{t`Help`}</Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                <Menu.Item
                  onClick={() => openModal("about")}
                >{t`About Metabase`}</Menu.Item>
                <Menu.Item
                  onClick={() => dispatch(setOpenModal("help"))}
                >{t`Keyboard shortcuts`}</Menu.Item>
                <Menu.Item
                  component={ForwardRefLink}
                  to="/getting-started"
                >{t`How to use Metabase`}</Menu.Item>
                <Menu.Item
                  onClick={() => {
                    trackErrorDiagnosticModalOpened("profile-menu");
                    onOpenDiagnostics();
                  }}
                >{t`Download diagnostics`}</Menu.Item>
              </Menu.Sub.Dropdown>
            </Menu.Sub>
            <Menu.Item onClick={() => onLogout()}>{t`Sign out`}</Menu.Item>
          </Box>
        </Menu.Dropdown>
      </Menu>

      <AboutModal onClose={closeModal} opened={modalOpen === "about"} />
      {modalOpen === "diagnostic" && (
        <ErrorDiagnosticModalWrapper isModalOpen={true} onClose={closeModal} />
      )}
    </>
  );
}

const connector = connect(mapStateToProps, mapDispatchToProps);

export const ModeSwitcher = connector(ProfileLinkInner);

/**
 * {menuItems.map((item, index) => {
            if (!item) {
              return null;
            }

            if (item.separator) {
              return <Menu.Divider key={index} />;
            }

            const component = item.externalLink
              ? "a"
              : item.link
                ? ForwardRefLink
                : "button";

            const commonProps = {
              leftSection: item.icon && <Icon name={item.icon} />,
              onClick: () => {
                if (item.action) {
                  item.action();
                }
              },
            };

            if (component === ForwardRefLink && item.link) {
              return (
                <Menu.Item<typeof ForwardRefLink>
                  key={item.title}
                  {...commonProps}
                  component={ForwardRefLink}
                  to={item.link}
                >
                  {item.title}
                </Menu.Item>
              );
            }

            if (component === "a" && item.link) {
              return (
                <Menu.Item<"a">
                  key={item.title}
                  {...commonProps}
                  component="a"
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.title}
                </Menu.Item>
              );
            }

            return (
              <Menu.Item<"button">
                key={item.title}
                {...commonProps}
                component="button"
              >
                {item.title}
              </Menu.Item>
            );
          })}
 */
