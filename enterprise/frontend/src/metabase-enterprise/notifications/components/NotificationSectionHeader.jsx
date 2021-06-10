import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";
import { withRouter } from "react-router";
import { connect } from "react-redux";

import { getIsModerator } from "metabase-enterprise/moderation/selectors";

import { HeaderContainer, RadioTabs } from "./NotificationSectionHeader.styled";

const sections = {
  user: [
    { name: t`Notifications`, value: "/notifications" },
    // { name: t`Activity`, value: "/activity" },
  ],
  moderator: [
    { name: t`Review requests`, value: "/requests?status=open" },
    { name: t`Resolved`, value: "/requests?status=resolved,closed" },
    { name: t`Notifications`, value: "/notifications" },
    // { name: t`Activity`, value: "/activity" },
  ],
};

NotificationSectionHeader.propTypes = {
  router: PropTypes.object.isRequired,
  isModerator: PropTypes.bool,
};

function NotificationSectionHeader({ router, isModerator }) {
  const section = getSection(router.location.pathname, router.location.query);
  const onChangeTab = section => {
    router.push(section);
  };

  return (
    <HeaderContainer>
      <RadioTabs
        underlined
        value={section}
        options={isModerator ? sections.moderator : sections.user}
        onChange={onChangeTab}
      />
    </HeaderContainer>
  );
}

const mapStateToProps = (state, props) => {
  return {
    isModerator: getIsModerator(state, props),
  };
};

export default _.compose(
  connect(mapStateToProps),
  withRouter,
)(NotificationSectionHeader);

function getSection(pathname, queryParams) {
  if (pathname.includes("/activity")) {
    return "/activity";
  } else if (pathname.includes("/requests")) {
    return `/requests?status=${queryParams.status}`;
  } else if (pathname.includes("/notifications")) {
    return "/notifications";
  }
}
