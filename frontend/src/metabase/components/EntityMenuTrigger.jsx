/* eslint-disable react/prop-types */
import React from "react";

import Tooltip from "metabase/components/Tooltip";
import { EntityMenuIconButton } from "./EntityMenuTrigger.styled";

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
    <EntityMenuIconButton onClick={onClick} icon={icon} {...triggerProps} />
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
