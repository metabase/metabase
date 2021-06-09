import React from "react";
import PropTypes from "prop-types";

import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import { getModerationStatusIcon } from "metabase-enterprise/moderation";
import { PillContainer } from "./ModerationIssuePill.styled";
import Icon from "metabase/components/Icon";

ModerationIssuePill.propTypes = {
  className: PropTypes.string,
  type: PropTypes.string.isRequired,
  status: PropTypes.string,
};

function ModerationIssuePill({ className, type, status }) {
  const { icon, color, filter } = getModerationStatusIcon(type, status);
  return (
    <PillContainer className={className} color={color} filter={filter}>
      <Icon name={icon} size={18} />
      <span>{MODERATION_TEXT[type].action}</span>
    </PillContainer>
  );
}

export default ModerationIssuePill;
