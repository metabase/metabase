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
import CS from "metabase/css/core/index.css";
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
import { ActionIcon, Icon, type IconName, Menu, Tooltip } from "metabase/ui";
import type { MetabaseInfo } from "metabase-types/api";
import type { AdminPath, State } from "metabase-types/store";

import { useHelpLink } from "./useHelpLink";

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
  const version = useSetting("version") as MetabaseInfo["version"];
  const applicationName = useSelector(getApplicationName);
  const { tag, date, ...versionExtra } = version;
  const helpLink = useHelpLink();
  const dispatch = useDispatch();

  const openModal = (modalName: string) => {
    setModalOpen(modalName);
  };

  const closeModal = () => {
    setModalOpen(null);
  };

  const generateOptionsForUser = (): MenuItem[] => {
    const showAdminSettingsItem = adminItems?.length > 0;
    // If the instance is not new, we remove the link from the sidebar automatically and show it here instead!
    const showOnboardingLink = !isNewInstance && canAccessOnboardingPage;

    const menuItems: MenuItem[] = [];
    menuItems.push({
      title: t`Account settings`,
      icon: null,
      link: Urls.accountSettings(),
    });
    if (showAdminSettingsItem) {
      menuItems.push({
        title: t`Admin settings`,
        icon: null,
        link: "/admin",
      });
    }
    if (canAccessDataStudio) {
      menuItems.push({
        title: t`Data studio`,
        icon: null,
        link: Urls.dataStudio(),
      });
    }
    menuItems.push({ separator: true });
    if (helpLink.visible) {
      menuItems.push({
        title: t`Help`,
        icon: null,
        link: helpLink.href,
        externalLink: true,
      });
    }
    if (showOnboardingLink) {
      menuItems.push({
        // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for non-whitelabeled instances
        title: t`How to use Metabase`,
        icon: null,
        link: "/getting-started",
      });
    }
    menuItems.push(
      {
        title: t`Keyboard shortcuts`,
        icon: null,
        action: () => dispatch(setOpenModal("help")),
      },
      {
        title: t`Download diagnostics`,
        icon: null,
        action: () => {
          trackErrorDiagnosticModalOpened("profile-menu");
          onOpenDiagnostics();
        },
      },
      {
        title: t`About ${applicationName}`,
        icon: null,
        action: () => openModal("about"),
      },
      {
        separator: true,
      },
      {
        title: t`Sign out`,
        icon: null,
        action: () => onLogout(),
      },
    );

    return menuItems;
  };

  // show trademark if application name is not whitelabeled
  const isWhiteLabeling = useSelector(getIsWhiteLabeling);
  const showTrademark = !isWhiteLabeling;
  const menuItems = generateOptionsForUser();

  return (
    <>
      <Menu position="bottom-end" shadow="md" width={200}>
        <Menu.Target>
          <Tooltip label={t`Settings`}>
            <ActionIcon
              size="2.25rem"
              p="sm"
              variant="outline"
              color="text-primary"
              bd="1px solid var(--mb-color-border)"
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
              {tag && !/^v\d+\.\d+\.\d+$/.test(tag) && (
                <div>
                  {_.map(versionExtra, (value, key) => (
                    <p key={key} className={cx(CS.textMedium, CS.textBold)}>
                      {capitalize(key)}: {String(value)}
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
    </>
  );
}

const connector = connect(mapStateToProps, mapDispatchToProps);

export const ProfileLink = connector(ProfileLinkInner);
