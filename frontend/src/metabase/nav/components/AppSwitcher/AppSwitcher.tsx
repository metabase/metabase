import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { ErrorDiagnosticModalWrapper } from "metabase/common/components/ErrorPages/ErrorDiagnosticModal";
import { trackErrorDiagnosticModalOpened } from "metabase/common/components/ErrorPages/analytics";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink } from "metabase/common/components/Link";
import { trackDataStudioOpened } from "metabase/common/data-studio/analytics";
import { canAccessDataStudio as canAccessDataStudioSelector } from "metabase/common/data-studio/selectors";
import { canAccessEmbeddingHub as canAccessEmbeddingHubSelector } from "metabase/common/embedding-hub/selectors";
import { useHelpLink } from "metabase/common/hooks";
import { trackMonitorOpened } from "metabase/common/monitor/analytics";
import { canAccessMonitor as canAccessMonitorSelector } from "metabase/common/monitor/selectors";
import { prepareInitials } from "metabase/common/utils/user";
import { getUser } from "metabase/current-user";
import { useIsSpaceSwitcherHeadingShown } from "metabase/nav/prototype/space-switcher-heading-store";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import { useDispatch, useSelector } from "metabase/redux";
import { openDiagnostics } from "metabase/redux/app";
import { logout } from "metabase/redux/auth";
import { setOpenModal } from "metabase/redux/ui";
import { getAdminPaths } from "metabase/selectors/admin";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/selectors/onboarding";
import { getApplicationName } from "metabase/selectors/whitelabel";
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
import type { MenuProps } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { AboutModal } from "../AboutModal/AboutModal";

import S from "./AppSwitcher.module.css";
import { type CurrentApp, useGetCurrentApp } from "./useGetCurrentApp";

const CURRENT_APP_ICON_OVERRIDES: {
  name: IconName;
  c: ColorName;
} = { name: "check_filled", c: "core-brand" };

export type Space = {
  id: CurrentApp;
  label: string;
  icon: IconName;
  url: string;
  onOpen?: () => void;
};

/**
 * The spaces ("apps") the user can switch between, and which one they're in.
 * `spaces` is empty when the user can only use the main app.
 */
export function useSpaces(): { spaces: Space[]; currentSpace: CurrentApp } {
  const adminItems = useSelector(getAdminPaths);
  const canAccessDataStudio = useSelector(canAccessDataStudioSelector);
  const canAccessMonitor = useSelector(canAccessMonitorSelector);
  const canAccessEmbeddingHub = useSelector(canAccessEmbeddingHubSelector);
  const currentSpace = useGetCurrentApp();
  const canAccessAdmin = adminItems?.length > 0;

  if (
    !canAccessDataStudio &&
    !canAccessMonitor &&
    !canAccessEmbeddingHub &&
    !canAccessAdmin
  ) {
    return { spaces: [], currentSpace };
  }

  const spaces: Space[] = [
    { id: "main", label: t`Main app`, icon: "dashboard", url: "/" },
  ];
  if (canAccessAdmin) {
    spaces.push({ id: "admin", label: t`Admin`, icon: "io", url: "/admin" });
  }
  if (canAccessDataStudio) {
    spaces.push({
      id: "data-studio",
      label: t`Data studio`,
      icon: "table",
      url: Urls.dataStudio(),
      onOpen: trackDataStudioOpened,
    });
  }
  if (canAccessMonitor) {
    spaces.push({
      id: "monitor",
      label: t`Monitor`,
      icon: "pulse",
      url: Urls.monitor(),
      onOpen: trackMonitorOpened,
    });
  }
  if (canAccessEmbeddingHub) {
    spaces.push({
      id: "embedding-hub",
      label: t`Embedding hub`,
      icon: "embed",
      url: Urls.embeddingHub(),
    });
  }

  return { spaces, currentSpace };
}

/** Menu items for switching spaces; the current space gets a check. */
export function SpaceMenuItems({
  spaces,
  currentSpace,
}: {
  spaces: Space[];
  currentSpace: CurrentApp;
}) {
  return spaces.map((space) => (
    <Menu.Item
      key={space.id}
      component={ForwardRefLink}
      to={space.url}
      onAuxClick={space.onOpen}
      onClickCapture={space.onOpen}
      leftSection={
        <Icon
          name={space.icon}
          {...(currentSpace === space.id ? CURRENT_APP_ICON_OVERRIDES : null)}
        />
      }
    >
      {space.label}
    </Menu.Item>
  ));
}

/** The signed-in user's profile link, as a menu item. */
export function ProfileMenuItem() {
  const user = useSelector(getUser);

  return (
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
          <Text c="text-secondary" fz="md" lh="xs">
            {user?.email}
          </Text>
        </Stack>
      </Group>
    </Menu.Item>
  );
}

/** The Help submenu and Sign out, as menu items. */
export function HelpAndSignOutMenuItems({
  onOpenAbout,
  helpSubmenuPosition = "left-start",
}: {
  onOpenAbout: () => void;
  helpSubmenuPosition?: MenuProps["position"];
}) {
  const dispatch = useDispatch();
  const applicationName = useSelector(getApplicationName);
  const canAccessOnboardingPage = useSelector(getCanAccessOnboardingPage);
  const isNewInstance = useSelector(getIsNewInstance);
  const helpLink = useHelpLink();

  // If the instance is not new, we remove the link from the sidebar automatically and show it here instead!
  const showOnboardingLink = !isNewInstance && canAccessOnboardingPage;

  return (
    <>
      <Menu.Sub position={helpSubmenuPosition} offset={20} closeDelay={350}>
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
          <Menu.Item onClick={onOpenAbout}>
            {t`About ${applicationName}`}
          </Menu.Item>
        </Menu.Sub.Dropdown>
      </Menu.Sub>
      <Menu.Item onClick={() => dispatch(logout())}>{t`Sign out`}</Menu.Item>
    </>
  );
}

export const AppSwitcher = ({
  className,
  menuPosition = "bottom-end",
  target,
  showProfile = true,
}: {
  className?: string;
  menuPosition?: MenuProps["position"];
  /** PROTOTYPE: replaces the default round button that opens the menu. */
  target?: ReactNode;
  /**
   * PROTOTYPE: the avatar, name and email at the top. Without it, an
   * "Account settings" item sits above Help instead.
   */
  showProfile?: boolean;
}) => {
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const user = useSelector(getUser);
  const { spaces, currentSpace } = useSpaces();
  const hasSpaces = spaces.length > 0;
  // PROTOTYPE: in "No top nav", the space name beside the logo opens this
  // menu, so the default top-right button steps aside while it's shown.
  const { variant } = useNavVariant();
  const isHeadingShown = useIsSpaceSwitcherHeadingShown();
  const isMenuOnLeft = menuPosition?.endsWith("start") ?? false;

  const closeModal = () => {
    setModalOpen(null);
  };

  if (!target && variant === "no-top-nav" && isHeadingShown) {
    return null;
  }

  return (
    <>
      <Menu position={menuPosition} shadow="sm" width={200} offset={9}>
        <Menu.Target>
          {target ? (
            target
          ) : hasSpaces ? (
            <ActionIcon
              variant={
                currentSpace === "admin" ? "on-dark-secondary" : "default"
              }
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
          {showProfile && (
            <Box px="lg">
              <ProfileMenuItem />
            </Box>
          )}

          {/* Apps */}
          {hasSpaces && (
            <>
              {showProfile && <Divider w="100%" my="sm" />}
              <Box px="lg">
                <SpaceMenuItems spaces={spaces} currentSpace={currentSpace} />
              </Box>
            </>
          )}

          {/* Logout and Help */}
          {(showProfile || hasSpaces) && <Divider w="100%" my="sm" />}
          <Box px="lg">
            {!showProfile && (
              <Menu.Item component={ForwardRefLink} to={Urls.accountSettings()}>
                {t`Account settings`}
              </Menu.Item>
            )}
            <HelpAndSignOutMenuItems
              onOpenAbout={() => setModalOpen("about")}
              // Opening toward the page, not off its edge.
              helpSubmenuPosition={isMenuOnLeft ? "right-start" : "left-start"}
            />
          </Box>
        </Menu.Dropdown>
      </Menu>

      <AboutModal onClose={closeModal} opened={modalOpen === "about"} />
      {modalOpen === "diagnostic" && (
        <ErrorDiagnosticModalWrapper isModalOpen={true} onClose={closeModal} />
      )}
    </>
  );
};
