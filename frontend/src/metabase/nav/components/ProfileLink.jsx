/* eslint-disable no-unused-vars */
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { getAdminPaths } from "metabase/admin/app/selectors";
import EntityMenu from "metabase/components/EntityMenu";
import LogoIcon from "metabase/components/LogoIcon";
import Modal from "metabase/components/Modal";
import { color } from "metabase/lib/colors";
import { capitalize } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getIsPaidPlan, getSetting } from "metabase/selectors/settings";
import {
  getApplicationName,
  getIsWhiteLabeling,
} from "metabase/selectors/whitelabel";
import { UtilApi } from "metabase/services";

// generate the proper set of list items for the current user
// based on whether they're an admin or not
const mapStateToProps = state => ({
  adminItems: getAdminPaths(state),
});

export default connect(mapStateToProps)(ProfileLink);

function ProfileLink({ user, adminItems, onLogout }) {
  const [modalOpen, setModalOpen] = useState(null);
  const [bugReportDetails, setBugReportDetails] = useState(null);
  const version = useSelector(state => getSetting(state, "version"));
  const applicationName = useSelector(getApplicationName);
  const { tag, date, ...versionExtra } = version;
  const isPaidPlan = useSelector(getIsPaidPlan);

  const openModal = modalName => {
    setModalOpen(modalName);
  };

  const closeModal = () => {
    setModalOpen(null);
  };

  const generateOptionsForUser = () => {
    const isAdmin = user.is_superuser;
    const showAdminSettingsItem = adminItems?.length > 0;
    const compactBugReportDetailsForUrl = encodeURIComponent(
      JSON.stringify(bugReportDetails),
    );

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
        title: t`Activity`,
        icon: null,
        link: "/activity",
        event: `Navbar;Profile Dropdown;Activity ${tag}`,
      },
      /*
      {
        title: t`Help`,
        icon: null,
        link:
          isAdmin && isPaidPlan
            ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}&diag=${compactBugReportDetailsForUrl}`
            : `https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}`,

        externalLink: true,
        event: `Navbar;Profile Dropdown;About ${tag}`,
      },
      {
        title: t`About ${applicationName}`,
        icon: null,
        action: () => openModal("about"),
        event: `Navbar;Profile Dropdown;About ${tag}`,
      },
      */
      {
        title: t`Sign out`,
        icon: null,
        action: () => onLogout(),
        event: `Navbar;Profile Dropdown;Logout`,
      },
    ].filter(Boolean);
  };

  useEffect(() => {
    const isAdmin = user.is_superuser;
    if (isAdmin && isPaidPlan) {
      UtilApi.bug_report_details().then(setBugReportDetails);
    }
  }, [user.is_superuser, isPaidPlan]);

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
      />
      {modalOpen === "about" ? (
        <Modal small onClose={closeModal}>
          <div className="px4 pt4 pb2 text-centered relative">
            <div className="text-brand pb2">
              <LogoIcon height={48} />
            </div>
            <h2
              style={{ fontSize: "1.75em" }}
              className="text-dark"
            >{t`Thanks for using ${applicationName}!`}</h2>
            <div className="pt2">
              <h3 className="text-dark mb1">
                {t`You're on version`} {tag}
              </h3>
              <p className="text-medium text-bold">
                {t`Built on`} {date}
              </p>
              {!/^v\d+\.\d+\.\d+$/.test(tag) && (
                <div>
                  {_.map(versionExtra, (value, key) => (
                    <p key={key} className="text-medium text-bold">
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
              className="p2 h5 text-centered text-medium border-top"
            >
              <span className="block">
                <span className="text-bold">Metabase</span>{" "}
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
  user: PropTypes.object.isRequired,
  adminItems: PropTypes.array,
  onLogout: PropTypes.func.isRequired,
};
