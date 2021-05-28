import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";

import { color, darken } from "metabase/lib/colors";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";

NotificationCenterLink.propTypes = {
  className: PropTypes.string,
};

function NotificationCenterLink({ className }) {
  return (
    <IconWrapper
      className={cx(className, "relative hide sm-show mr1 overflow-hidden")}
      hover={{
        backgroundColor: darken(color("nav")),
        color: "white",
      }}
    >
      <Link
        to="/notifications"
        className="flex align-center"
        data-metabase-event={`NavBar;Notifications`}
      >
        <Icon
          size={18}
          p={"11px"}
          name="document_curled"
          tooltip={t`View notifications`}
        />
      </Link>
    </IconWrapper>
  );
}

export default NotificationCenterLink;
