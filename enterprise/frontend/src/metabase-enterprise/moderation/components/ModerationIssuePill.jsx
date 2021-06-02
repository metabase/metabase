import React from "react";
import PropTypes from "prop-types";

import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  getModerationStatusIcon,
  getColor,
} from "metabase-enterprise/moderation";
import Icon from "metabase/components/Icon";
import { PillContainer } from "./ModerationIssuePill.styled";

ModerationIssuePill.propTypes = {
  className: PropTypes.string,
  type: PropTypes.string.isRequired,
  status: PropTypes.string,
};

function ModerationIssuePill({ className, type, status }) {
  const icon = getModerationStatusIcon(type);
  const color = getColor(type);

  return (
    <PillContainer className={className} color={color}>
      <Icon className="mr1" name={icon} size={18} />
      <span className="text-bold">{MODERATION_TEXT[type].action}</span>
    </PillContainer>
  );
}

export default ModerationIssuePill;
