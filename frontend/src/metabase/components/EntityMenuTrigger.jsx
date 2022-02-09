/* eslint-disable react/prop-types */
import React from "react";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const EntityMenuTrigger = ({
  icon,
  onClick,
  open,
  tooltip,
  triggerProps,
  trigger,
}) => {
  const triggerContent = trigger ? (
    <span onClick={onClick} {...triggerProps}>
      {trigger}
    </span>
  ) : (
    <IconWrapper onClick={onClick} {...triggerProps}>
      <Icon size={18} name={icon} m={1} />
    </IconWrapper>
  );
  return tooltip ? (
    <Tooltip tooltip={tooltip} isEnabled={!open}>
      {triggerContent}
    </Tooltip>
  ) : (
    triggerContent
  );
};

export default EntityMenuTrigger;
