/* eslint-disable react/prop-types */
import React from "react";

import Icon, { IconWrapper } from "metabase/components/Icon";
import Button from "metabase/components/Button";
import Tooltip from "metabase/components/Tooltip";

const EntityMenuTrigger = ({
  children,
  icon,
  onClick,
  open,
  tooltip,
  triggerProps,
}) => {
  const trigger = children ? (
    <Button icon={icon} onClick={onClick} {...triggerProps}>
      {children}
    </Button>
  ) : (
    <IconWrapper onClick={onClick} {...triggerProps}>
      <Icon size={18} name={icon} m={1} />
    </IconWrapper>
  );
  return tooltip ? (
    <Tooltip tooltip={tooltip} isEnabled={!open}>
      {trigger}
    </Tooltip>
  ) : (
    trigger
  );
};

export default EntityMenuTrigger;
