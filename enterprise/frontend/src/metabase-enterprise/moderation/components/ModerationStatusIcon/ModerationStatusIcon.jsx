import PropTypes from "prop-types";

import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";
import { getStatusIcon } from "metabase-enterprise/moderation/service";


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
