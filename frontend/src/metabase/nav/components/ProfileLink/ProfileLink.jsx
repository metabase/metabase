import cx from "classnames";
import PropTypes from "prop-types";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  getAdminPaths,
  getIsOnboardingSidebarLinkDismissed,
} from "metabase/admin/app/selectors";
import { useSetting } from "metabase/common/hooks";
import { ErrorDiagnosticModalWrapper } from "metabase/components/ErrorPages/ErrorDiagnosticModal";
import { trackErrorDiagnosticModalOpened } from "metabase/components/ErrorPages/analytics";
import LogoIcon from "metabase/components/LogoIcon";
import Modal from "metabase/components/Modal";
import { ForwardRefLink } from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/home/selectors";
import { capitalize } from "metabase/lib/formatting";
import { connect, useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { openDiagnostics } from "metabase/redux/app";
import { setOpenModal } from "metabase/redux/ui";
import {
  getApplicationName,
  getIsWhiteLabeling,
} from "metabase/selectors/whitelabel";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";

import { useHelpLink } from "./useHelpLink";

// generate the proper set of list items for the current user
// based on whether they're an admin or not
const mapStateToProps = (state) => ({
  adminItems: getAdminPaths(state),
  canAccessOnboardingPage: getCanAccessOnboardingPage(state),
  isNewInstance: getIsNewInstance(state),
  showOnboardingLink: getIsOnboardingSidebarLinkDismissed(state),
});

const mapDispatchToProps = {
  openDiagnostics,
};

export default connect(mapStateToProps, mapDispatchToProps)(ProfileLink);

function ProfileLink({
  adminItems,
  canAccessOnboardingPage,
  isNewInstance,
  onLogout,
  showOnboardingLink,
  openDiagnostics,
}) {
  const [modalOpen, setModalOpen] = useState(null);
  const version = useSetting("version");
  const applicationName = useSelector(getApplicationName);
  const { tag, date, ...versionExtra } = version;
  const helpLink = useHelpLink();
  const dispatch = useDispatch();

  const openModal = (modalName) => {
    setModalOpen(modalName);
  };

  const closeModal = () => {
    setModalOpen(null);
  };

  const generateOptionsForUser = () => {
    const showAdminSettingsItem = adminItems?.length > 0;

    return [
      {
        title: t`Account settings`,
        icon: null,
        link: Urls.accountSettings(),
        event: `Navbar;Profile Dropdown;Edit Profile`,
      },
      showAdminSettingsItem && {
        title: t`Admin settings`,
        icon: null,
        link: "/admin",
        event: `Navbar;Profile Dropdown;Enter Admin`,
      },
      {
        title: t`Keyboard Shortcuts`,
        icon: null,
        action: () => dispatch(setOpenModal("help")),
      },
      {
        separator: true,
      },
      helpLink.visible && {
        title: t`Help`,
        icon: null,
        link: helpLink.href,
        externalLink: true,
        event: `Navbar;Profile Dropdown;About ${tag}`,
      },
      (!isNewInstance || showOnboardingLink) &&
        canAccessOnboardingPage && {
          // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for non-whitelabeled instances
          title: t`How to use Metabase`,
          icon: null,
          link: "/getting-started",
          event: `Navbar;Profile Dropdown;Getting Started`,
        },
      {
        title: t`Report an issue`,
        icon: null,
        action: () => {
          trackErrorDiagnosticModalOpened("profile-menu");
          openDiagnostics();
        },
        event: `Navbar;Profile Dropdown;Report Bug`,
      },
      {
        title: t`About ${applicationName}`,
        icon: null,
        action: () => openModal("about"),
        event: `Navbar;Profile Dropdown;About ${tag}`,
      },
      {
        separator: true,
      },
      {
        title: t`Sign out`,
        icon: null,
        action: () => onLogout(),
        event: `Navbar;Profile Dropdown;Logout`,
      },
    ].filter(Boolean);
  };

  // show trademark if application name is not whitelabeled
  const isWhiteLabeling = useSelector(getIsWhiteLabeling);
  const showTrademark = !isWhiteLabeling;

  const menuItems = generateOptionsForUser();

  return (
    <div>
      <Menu position="bottom-end" shadow="md" width={200}>
        <Menu.Target>
          <Tooltip label={t`Settings`}>
            <ActionIcon
              size="lg"
              variant="subtle"
              color="text-medium"
              aria-label={t`Settings`}
            >
              <Icon name="gear" size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          {menuItems.map((item, index) => {
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

            return (
              <Menu.Item
                key={item.title}
                leftSection={item.icon && <Icon name={item.icon} />}
                onClick={() => {
                  if (item.action) {
                    item.action();
                  }
                }}
                component={component}
                href={item.link}
                to={item.link}
                target={item.externalLink ? "_blank" : undefined}
                rel={item.externalLink ? "noopener noreferrer" : undefined}
              >
                {item.title}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>

      {modalOpen === "about" ? (
        <Modal small onClose={closeModal}>
          <div
            className={cx(CS.px4, CS.pt4, CS.pb2, CS.textCentered, CS.relative)}
          >
            <div className={cx(CS.textBrand, CS.pb2)}>
              <LogoIcon height={48} />
            </div>
            <h2
              style={{ fontSize: "1.75em" }}
              className={CS.textDark}
            >{t`Thanks for using ${applicationName}!`}</h2>
            <div className={CS.pt2}>
              <h3 className={cx(CS.textDark, CS.mb1)}>
                {t`You're on version`} {tag}
              </h3>
              <p className={cx(CS.textMedium, CS.textBold)}>
                {t`Built on`} {date}
              </p>
              {!/^v\d+\.\d+\.\d+$/.test(tag) && (
                <div>
                  {_.map(versionExtra, (value, key) => (
                    <p key={key} className={cx(CS.textMedium, CS.textBold)}>
                      {capitalize(key)}: {value}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
          {showTrademark && (
            <div
              style={{ borderWidth: "2px" }}
              className={cx(
                CS.p2,
                CS.h5,
                CS.textCentered,
                CS.textMedium,
                CS.borderTop,
              )}
            >
              <span className={CS.block}>
                {/* eslint-disable-next-line i18next/no-literal-string, no-literal-metabase-strings -- This only shows on OSS instance */}
                <span className={CS.textBold}>Metabase</span>{" "}
                {/* eslint-disable-next-line i18next/no-literal-string, no-literal-metabase-strings -- This only shows on OSS instance */}
                {t`is a Trademark of`} Metabase, Inc
              </span>
              <span>{t`and is built with care by a team from all across this pale blue dot.`}</span>
            </div>
          )}
        </Modal>
      ) : null}
      {modalOpen === "diagnostic" && (
        <ErrorDiagnosticModalWrapper isModalOpen={true} onClose={closeModal} />
      )}
    </div>
  );
}

ProfileLink.propTypes = {
  adminItems: PropTypes.array,
  canAccessOnboardingPage: PropTypes.bool,
  isNewInstance: PropTypes.bool,
  onLogout: PropTypes.func.isRequired,
  showOnboardingLink: PropTypes.bool,
  openDiagnostics: PropTypes.func.isRequired,
};
