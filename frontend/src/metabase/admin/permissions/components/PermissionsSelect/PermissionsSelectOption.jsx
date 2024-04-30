import PropTypes from "prop-types";
import { useState } from "react";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

import {
  IconContainer,
  PermissionsSelectOptionRoot,
  PermissionsSelectLabel,
} from "./PermissionsSelectOption.styled";

export const optionShape = {
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.element]).isRequired,
  icon: PropTypes.string.isRequired,
  iconColor: PropTypes.string.isRequired,
};

const propTypes = {
  ...optionShape,
  className: PropTypes.string,
  hint: PropTypes.string,
};

export function PermissionsSelectOption({
  label,
  icon,
  iconColor,
  className,
  hint,
}) {
  const [shouldShowTooltip, setShouldShowTooltip] = useState(false);

  return (
    <PermissionsSelectOptionRoot
      className={className}
      onMouseEnter={() => setShouldShowTooltip(true)}
      onMouseLeave={() => setShouldShowTooltip(false)}
    >
      <Tooltip tooltip={hint} isOpen={shouldShowTooltip}>
        <IconContainer color={iconColor}>
          <Icon name={icon} />
        </IconContainer>
      </Tooltip>
      <PermissionsSelectLabel>{label}</PermissionsSelectLabel>
    </PermissionsSelectOptionRoot>
  );
}

PermissionsSelectOption.propTypes = propTypes;
