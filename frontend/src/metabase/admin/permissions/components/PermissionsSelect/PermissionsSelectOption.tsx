import { useState } from "react";

import { Icon, Tooltip } from "metabase/ui";

import type { PermissionOption } from "../../types";

import {
  IconContainer,
  PermissionsSelectLabel,
  PermissionsSelectOptionRoot,
} from "./PermissionsSelectOption.styled";

interface PermissionsSelectOptionProps extends Omit<PermissionOption, "value"> {
  className?: string;
  hint?: string | null;
}

export function PermissionsSelectOption({
  label,
  icon,
  iconColor,
  className,
  hint,
}: PermissionsSelectOptionProps) {
  const [shouldShowTooltip, setShouldShowTooltip] = useState(false);

  return (
    <PermissionsSelectOptionRoot
      className={className}
      onMouseEnter={() => setShouldShowTooltip(true)}
      onMouseLeave={() => setShouldShowTooltip(false)}
    >
      <Tooltip label={hint} disabled={!hint} opened={shouldShowTooltip}>
        <IconContainer color={iconColor}>
          <Icon name={icon} />
        </IconContainer>
      </Tooltip>
      <PermissionsSelectLabel>{label}</PermissionsSelectLabel>
    </PermissionsSelectOptionRoot>
  );
}
