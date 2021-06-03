import React from "react";
import PropTypes from "prop-types";

import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  getModerationStatusIcon,
  getColor,
} from "metabase-enterprise/moderation";
import { PillContainer, GrayscaleIcon } from "./ModerationIssuePill.styled";

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
      <GrayscaleIcon
        name={icon}
        size={18}
        grayscale={status && status !== "open"}
      />
      <span className="text-bold">{MODERATION_TEXT[type].action}</span>
    </PillContainer>
  );
}

export default ModerationIssuePill;
