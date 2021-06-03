import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import cx from "classnames";
import { t } from "ttag";

import { color, darken } from "metabase/lib/colors";
import { getIsModerator } from "metabase-enterprise/moderation/selectors";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";

NotificationsLink.propTypes = {
  className: PropTypes.string,
  isModerator: PropTypes.bool,
};

// TODO -- some of this styling is duped from other Navbar components
function NotificationsLink({ className, isModerator }) {
  return isModerator ? (
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
  ) : null;
}

const mapStateToProps = (state, props) => {
  return {
    isModerator: getIsModerator(state, props),
  };
};

export default connect(mapStateToProps)(NotificationsLink);
