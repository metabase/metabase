import PropTypes from "prop-types";

import { color } from "metabase/lib/colors";
import { getStatusIcon } from "metabase-enterprise/moderation/service";

import Icon from "metabase/components/Icon";

ModerationStatusIcon.propTypes = {
  status: PropTypes.string,
};

function ModerationStatusIcon({ status, ...iconProps }) {
  const { name: iconName, color: iconColor } = getStatusIcon(status);
  return iconName ? (
    <Icon name={iconName} color={color(iconColor)} {...iconProps} />
  ) : null;
}

export default ModerationStatusIcon;
