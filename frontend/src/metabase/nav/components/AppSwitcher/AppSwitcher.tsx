import { useMemo, useState } from "react";
import {
  type PlainRoute,
  type WithRouterProps,
  withRouter,
} from "react-router";
import { t } from "ttag";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { logout } from "metabase/auth/actions";
import { ErrorDiagnosticModalWrapper } from "metabase/common/components/ErrorPages/ErrorDiagnosticModal";
import { trackErrorDiagnosticModalOpened } from "metabase/common/components/ErrorPages/analytics";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink } from "metabase/common/components/Link";
import { userInitials } from "metabase/common/utils/user";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/home/selectors";
import type { ColorName } from "metabase/lib/colors/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { openDiagnostics } from "metabase/redux/app";
import { setOpenModal } from "metabase/redux/ui";
import { getUser } from "metabase/selectors/user";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Avatar,
  Box,
  Divider,
  Group,
  Icon,
  type IconName,
  Menu,
  Stack,
  Text,
} from "metabase/ui";

import { AboutModal } from "../AboutModal/AboutModal";

import { useHelpLink } from "./useHelpLink";

const getCurrentApp = (routes: PlainRoute[]) => {
  return routes.map(({ app }) => app).find((app) => app) || "main";
};

const CURRENT_APP_ICON_OVERRIDES: {
  name: IconName;
  c: ColorName;
} = { name: "check_filled", c: "brand" };

export const AppSwitcher = withRouter(
  ({ className, routes }: { className?: string } & WithRouterProps) => {
    const [modalOpen, setModalOpen] = useState<string | null>(null);

    const dispatch = useDispatch();

    const user = useSelector(getUser);
    const applicationName = useSelector(getApplicationName);

    // generate the proper set of list items for the current user
    // based on whether they're an admin or not
    const adminItems = useSelector(getAdminPaths);
    const canAccessOnboardingPage = useSelector(getCanAccessOnboardingPage);
    const canAccessDataStudio = useSelector(
      PLUGIN_DATA_STUDIO.canAccessDataStudio,
    );
    const isNewInstance = useSelector(getIsNewInstance);
    const helpLink = useHelpLink();

    const openModal = (modalName: string) => {
      setModalOpen(modalName);
    };

    const closeModal = () => {
      setModalOpen(null);
    };

    const currentApp = getCurrentApp(routes);

    const appsSection = useMemo(() => {
      const showAdminSettingsItem = adminItems?.length > 0;

      if (!canAccessDataStudio && !showAdminSettingsItem) {
        return null;
      }

      const items: React.ReactNode[] = [
        <Menu.Item
          key="main-app-link"
          component={ForwardRefLink}
          to="/"
          leftSection={
            <Icon
              name="dashboard"
              {...(currentApp === "main" ? CURRENT_APP_ICON_OVERRIDES : null)}
            />
          }
        >
          {t`Main app`}
        </Menu.Item>,
      ];

      if (canAccessDataStudio) {
        items.push(
          <Menu.Item
            key="data-studio-app-link"
            component={ForwardRefLink}
            to={Urls.dataStudio()}
            leftSection={
              <Icon
                name="table"
                {...(currentApp === "data-studio"
                  ? CURRENT_APP_ICON_OVERRIDES
                  : null)}
              />
            }
          >
            {t`Data studio`}
          </Menu.Item>,
        );
      }
      if (showAdminSettingsItem) {
        items.push(
          <Menu.Item
            key="admin-app-link"
            component={ForwardRefLink}
            to={"/admin"}
            leftSection={
              <Icon
                name="io"
                {...(currentApp === "admin"
                  ? CURRENT_APP_ICON_OVERRIDES
                  : null)}
              />
            }
          >{t`Admin`}</Menu.Item>,
        );
      }

      return (
        <>
          <Divider key="app-sectiondivider" w="100%" my="sm" />
          <Box px="md">{items}</Box>
        </>
      );
    }, [canAccessDataStudio, adminItems, currentApp]);

    // If the instance is not new, we remove the link from the sidebar automatically and show it here instead!
    const showOnboardingLink = !isNewInstance && canAccessOnboardingPage;

    return (
      <>
        <Menu position="bottom-end" shadow="md" width={200} offset={9}>
          <Menu.Target>
            <ActionIcon
              size="2.25rem"
              p="sm"
              variant="outline"
              bd="1px solid var(--mb-color-border)"
              aria-label={t`Settings`}
              bdrs="50%"
              className={className}
            >
              <Icon
                name="mode"
                // Need an escape hatch here for the white color in admin settings
                style={{
                  color:
                    currentApp === "admin"
                      ? "var(--mantine-color-white)"
                      : "var(--mb-color-text-primary)",
                }}
                size={16}
              />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown w={320} px="0">
            {/* Avatar Stuff */}
            <Box px="md">
              <Menu.Item
                component={ForwardRefLink}
                to={Urls.accountSettings()}
                data-testid="mode-switcher-profile-link"
              >
                <Group wrap="nowrap">
                  <Avatar color="brand" radius="lg" size={32}>
                    {user ? userInitials(user) : "?"}
                  </Avatar>
                  <Stack gap="xs">
                    <Text lh="xs">{user?.first_name}</Text>
                    <Text c="text-tertiary" fz="md" lh="xs">
                      {user?.email}
                    </Text>
                  </Stack>
                </Group>
              </Menu.Item>
            </Box>

            {/* Apps */}
            {appsSection}

            {/* Logout and Help */}
            <Divider w="100%" my="sm" />
            <Box px="md">
              <Menu.Sub position="left-start" offset={20} closeDelay={350}>
                <Menu.Sub.Target>
                  <Menu.Sub.Item>{t`Help`}</Menu.Sub.Item>
                </Menu.Sub.Target>
                <Menu.Sub.Dropdown data-testid="help-submenu">
                  {helpLink.visible && (
                    <Menu.Item component={ExternalLink} href={helpLink.href}>
                      {t`Get help`}
                    </Menu.Item>
                  )}
                  {showOnboardingLink && (
                    <Menu.Item component={ForwardRefLink} to="/getting-started">
                      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for non-whitelabeled instances */}
                      {t`How to use Metabase`}
                    </Menu.Item>
                  )}

                  <Menu.Item
                    onClick={() => dispatch(setOpenModal("help"))}
                  >{t`Keyboard shortcuts`}</Menu.Item>

                  <Menu.Item
                    onClick={() => {
                      trackErrorDiagnosticModalOpened("profile-menu");
                      dispatch(openDiagnostics());
                    }}
                  >{t`Download diagnostics`}</Menu.Item>
                  <Menu.Item onClick={() => openModal("about")}>
                    {t`About ${applicationName}`}
                  </Menu.Item>
                </Menu.Sub.Dropdown>
              </Menu.Sub>
              <Menu.Item
                onClick={() => dispatch(logout())}
              >{t`Sign out`}</Menu.Item>
            </Box>
          </Menu.Dropdown>
        </Menu>

        <AboutModal onClose={closeModal} opened={modalOpen === "about"} />
        {modalOpen === "diagnostic" && (
          <ErrorDiagnosticModalWrapper
            isModalOpen={true}
            onClose={closeModal}
          />
        )}
      </>
    );
  },
);
