import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";

import { color, darken } from "metabase/lib/colors";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";

NotificationsLink.propTypes = {
  className: PropTypes.string,
};

// TODO -- I should refactor this `hover` nonsense so that I don't have to dup the logic from NavBar.
// TODO -- maybe use styled-components instead of existing util classes
// TODO -- another issue: props like p="11px" on `<Icon>`; may want to abstract that out, too.
function NotificationsLink({ className }) {
  return (
    <IconWrapper
      className={cx(className, "relative hide sm-show mr1 overflow-hidden")}
      hover={{
        backgroundColor: darken(color("nav")),
        color: "white",
      }}
    >
      <Link
        to="/requests?status=open"
        className="flex align-center"
        data-metabase-event={`NavBar;Notifications`}
      >
        <Icon
          size={18}
          p="11px"
          name="document_curled"
          tooltip={t`View notifications`}
        />
      </Link>
    </IconWrapper>
  );
}

export default NotificationsLink;
