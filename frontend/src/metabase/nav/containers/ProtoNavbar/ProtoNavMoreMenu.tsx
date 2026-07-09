import { useState } from "react";
import { t } from "ttag";

import { ErrorDiagnosticModalWrapper } from "metabase/common/components/ErrorPages/ErrorDiagnosticModal";
import { trackErrorDiagnosticModalOpened } from "metabase/common/components/ErrorPages/analytics";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink } from "metabase/common/components/Link";
import { AboutModal } from "metabase/nav/components/AboutModal/AboutModal";
import { useHelpLink } from "metabase/nav/components/AppSwitcher/useHelpLink";
import { useDispatch, useSelector } from "metabase/redux";
import { openDiagnostics } from "metabase/redux/app";
import { logout } from "metabase/redux/auth";
import { setOpenModal } from "metabase/redux/ui";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/selectors/onboarding";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { ActionIcon, FixedSizeIcon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";

export function ProtoNavMoreMenu() {
  const [modalOpen, setModalOpen] = useState<string | null>(null);

  const dispatch = useDispatch();
  const applicationName = useSelector(getApplicationName);
  const canAccessOnboardingPage = useSelector(getCanAccessOnboardingPage);
  const isNewInstance = useSelector(getIsNewInstance);
  const helpLink = useHelpLink();

  const showOnboardingLink = !isNewInstance && canAccessOnboardingPage;

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
          <ActionIcon aria-label={t`More`} c="icon-secondary">
            <FixedSizeIcon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component={ForwardRefLink}
            to="/admin/settings"
            leftSection={<FixedSizeIcon name="gear" />}
          >
            {t`Settings`}
          </Menu.Item>
          <Menu.Item
            component={ForwardRefLink}
            to={Urls.accountSettings()}
            leftSection={<FixedSizeIcon name="person" />}
          >
            {t`Account`}
          </Menu.Item>
          <Menu.Item
            component={ForwardRefLink}
            to="/trash"
            leftSection={<FixedSizeIcon name="trash" />}
          >
            {t`Trash`}
          </Menu.Item>
          <Menu.Sub position="left-start" offset={20} closeDelay={350}>
            <Menu.Sub.Target>
              <Menu.Sub.Item leftSection={<FixedSizeIcon name="info" />}>
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
              <Menu.Item onClick={() => openModal("about")}>
                {t`About ${applicationName}`}
              </Menu.Item>
            </Menu.Sub.Dropdown>
          </Menu.Sub>
          <Menu.Item onClick={() => dispatch(logout())}>
            {t`Sign out`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <AboutModal onClose={closeModal} opened={modalOpen === "about"} />
      {modalOpen === "diagnostic" && (
        <ErrorDiagnosticModalWrapper isModalOpen={true} onClose={closeModal} />
      )}
    </>
  );
}
