import type { ReactNode } from "react";
import { t } from "ttag";

import { trackErrorDiagnosticModalOpened } from "metabase/common/components/ErrorPages/analytics";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink } from "metabase/common/components/Link";
import { trackDataStudioOpened } from "metabase/common/data-studio/analytics";
import { canAccessDataStudio as canAccessDataStudioSelector } from "metabase/common/data-studio/selectors";
import { canAccessEmbeddingHub as canAccessEmbeddingHubSelector } from "metabase/common/embedding-hub/selectors";
import { useHelpLink } from "metabase/common/hooks";
import { trackMonitorOpened } from "metabase/common/monitor/analytics";
import { canAccessMonitor as canAccessMonitorSelector } from "metabase/common/monitor/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import { openDiagnostics } from "metabase/redux/app";
import { setOpenModal } from "metabase/redux/ui";
import { getAdminPaths } from "metabase/selectors/admin";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/selectors/onboarding";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { type FloatingPosition, Icon, Menu } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { type CurrentApp, useGetCurrentApp } from "./useGetCurrentApp";

const CURRENT_APP_ICON_OVERRIDES: {
  name: IconName;
  c: ColorName;
} = { name: "check_filled", c: "core-brand" };

function AppIcon({
  name,
  app,
  currentApp,
}: {
  name: IconName;
  app: CurrentApp;
  currentApp: CurrentApp;
}) {
  return (
    <Icon
      name={name}
      {...(currentApp === app ? CURRENT_APP_ICON_OVERRIDES : null)}
    />
  );
}

/**
 * Menu items linking to each app the current user can open, starting with the
 * main app. The current app is marked with a check.
 */
export function useAppMenuItems(): ReactNode[] {
  const currentApp = useGetCurrentApp();
  const adminItems = useSelector(getAdminPaths);
  const canAccessDataStudio = useSelector(canAccessDataStudioSelector);
  const canAccessMonitor = useSelector(canAccessMonitorSelector);
  const canAccessEmbeddingHub = useSelector(canAccessEmbeddingHubSelector);

  const items: ReactNode[] = [
    <Menu.Item
      key="main-app-link"
      component={ForwardRefLink}
      to="/"
      leftSection={
        <AppIcon name="dashboard" app="main" currentApp={currentApp} />
      }
    >
      {t`Main app`}
    </Menu.Item>,
  ];

  if (adminItems?.length > 0) {
    items.push(
      <Menu.Item
        key="admin-app-link"
        component={ForwardRefLink}
        to="/admin"
        leftSection={<AppIcon name="io" app="admin" currentApp={currentApp} />}
      >{t`Admin`}</Menu.Item>,
    );
  }
  if (canAccessDataStudio) {
    items.push(
      <Menu.Item
        key="data-studio-app-link"
        component={ForwardRefLink}
        to={Urls.dataStudio()}
        onAuxClick={trackDataStudioOpened}
        onClickCapture={trackDataStudioOpened}
        leftSection={
          <AppIcon name="table" app="data-studio" currentApp={currentApp} />
        }
      >
        {t`Data studio`}
      </Menu.Item>,
    );
  }
  if (canAccessMonitor) {
    items.push(
      <Menu.Item
        key="monitor-app-link"
        component={ForwardRefLink}
        to={Urls.monitor()}
        onAuxClick={trackMonitorOpened}
        onClickCapture={trackMonitorOpened}
        leftSection={
          <AppIcon name="pulse" app="monitor" currentApp={currentApp} />
        }
      >
        {t`Monitor`}
      </Menu.Item>,
    );
  }
  if (canAccessEmbeddingHub) {
    items.push(
      <Menu.Item
        key="embedding-hub-link"
        component={ForwardRefLink}
        to={Urls.embeddingHub()}
        leftSection={
          <AppIcon name="embed" app="embedding-hub" currentApp={currentApp} />
        }
      >
        {t`Embedding hub`}
      </Menu.Item>,
    );
  }

  return items;
}

interface HelpSubmenuProps {
  position?: FloatingPosition;
  offset?: number;
  icon?: IconName;
  onOpenAbout: () => void;
}

/** "Help" submenu: help link, onboarding, shortcuts, diagnostics and About. */
export function HelpSubmenu({
  position = "left-start",
  offset = 20,
  icon,
  onOpenAbout,
}: HelpSubmenuProps) {
  const dispatch = useDispatch();
  const applicationName = useSelector(getApplicationName);
  const canAccessOnboardingPage = useSelector(getCanAccessOnboardingPage);
  const isNewInstance = useSelector(getIsNewInstance);
  const helpLink = useHelpLink();

  // If the instance is not new, we remove the link from the sidebar automatically and show it here instead!
  const showOnboardingLink = !isNewInstance && canAccessOnboardingPage;

  return (
    <Menu.Sub position={position} offset={offset} closeDelay={350}>
      <Menu.Sub.Target>
        <Menu.Sub.Item leftSection={icon && <Icon name={icon} />}>
          {t`Help`}
        </Menu.Sub.Item>
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
  );
}
