import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { t } from "ttag";

import { getIsModerator } from "metabase-enterprise/moderation/selectors";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";

NotificationsLink.propTypes = {
  className: PropTypes.string,
  isModerator: PropTypes.bool,
  hover: PropTypes.object,
};

function NotificationsLink({ className, hover, isModerator }) {
  const to = isModerator ? "/requests?status=open" : "/notifications";

  return (
    <IconWrapper className={className} hover={hover}>
      <Link
        to={to}
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

const mapStateToProps = (state, props) => {
  return {
    isModerator: getIsModerator(state, props),
  };
};

export default connect(mapStateToProps)(NotificationsLink);
