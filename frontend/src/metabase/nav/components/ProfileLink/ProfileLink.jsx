import cx from "classnames";
import PropTypes from "prop-types";
import { useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { useSetting } from "metabase/common/hooks";
import EntityMenu from "metabase/components/EntityMenu";
import LogoIcon from "metabase/components/LogoIcon";
import Modal from "metabase/components/Modal";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { capitalize } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  getApplicationName,
  getIsWhiteLabeling,
} from "metabase/selectors/whitelabel";

import { useHelpLink } from "./useHelpLink";

// generate the proper set of list items for the current user
// based on whether they're an admin or not
const mapStateToProps = state => ({
  adminItems: getAdminPaths(state),
});

export default connect(mapStateToProps)(ProfileLink);

function ProfileLink({ adminItems, onLogout }) {
  const [modalOpen, setModalOpen] = useState(null);
  const version = useSetting("version");
  const applicationName = useSelector(getApplicationName);
  const { tag, date, ...versionExtra } = version;
  const helpLink = useHelpLink();

  const openModal = modalName => {
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
      helpLink.visible && {
        title: t`Help`,
        icon: null,
        link: helpLink.href,
        externalLink: true,
        event: `Navbar;Profile Dropdown;About ${tag}`,
      },
      {
        title: t`About ${applicationName}`,
        icon: null,
        action: () => openModal("about"),
        event: `Navbar;Profile Dropdown;About ${tag}`,
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
  return (
    <div>
      <EntityMenu
        tooltip={t`Settings`}
        items={generateOptionsForUser()}
        triggerIcon="gear"
        triggerProps={{
          color: color("text-medium"),
          hover: {
            backgroundColor: color("brand"),
            color: color("text-white"),
          },
        }}
        // I've disabled this transition, since it results in the menu
        // sometimes not appearing until content finishes loading on complex
        // dashboards and questions #39303
        // TODO: Try to restore this transition once we upgrade to React 18 and can prioritize this update
        transitionDuration={0}
      />
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
                {/* eslint-disable-next-line no-literal-metabase-strings -- This only shows on OSS instance */}
                <span className={CS.textBold}>Metabase</span>{" "}
                {/* eslint-disable-next-line no-literal-metabase-strings -- This only shows on OSS instance */}
                {t`is a Trademark of`} Metabase, Inc
              </span>
              <span>{t`and is built with care by a team from all across this pale blue dot.`}</span>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

ProfileLink.propTypes = {
  adminItems: PropTypes.array,
  onLogout: PropTypes.func.isRequired,
};
