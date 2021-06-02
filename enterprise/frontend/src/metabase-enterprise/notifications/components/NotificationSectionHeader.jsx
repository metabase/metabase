import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { withRouter } from "react-router";

import { HeaderContainer, RadioTabs } from "./NotificationSectionHeader.styled";

const sections = {
  user: [
    { name: t`Notifications`, value: "/notifications" },
    { name: t`Activity`, value: "/activity" },
  ],
  moderator: [
    { name: t`Review requests`, value: "/requests?status=open" },
    { name: t`Resolved`, value: "/requests?status=resolved" },
    { name: t`Notifications`, value: "/notifications" },
    { name: t`Activity`, value: "/activity" },
  ],
};

NotificationSectionHeader.propTypes = {
  router: PropTypes.object.isRequired,
};

function NotificationSectionHeader({ router }) {
  const section = getSection(router.location.pathname, router.location.query);
  const onChangeTab = section => {
    router.push(section);
  };

  return (
    <HeaderContainer>
      <RadioTabs
        underlined
        value={section}
        options={sections.moderator}
        onChange={onChangeTab}
      />
    </HeaderContainer>
  );
}

export default withRouter(NotificationSectionHeader);

function getSection(pathname, queryParams) {
  if (pathname.includes("/activity")) {
    return "/activity";
  } else if (pathname.includes("/requests")) {
    return `/requests?status=${queryParams.status}`;
  } else if (pathname.includes("/notifications/")) {
    return "/notifications";
  }
}
