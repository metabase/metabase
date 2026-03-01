import type { ReactNode } from "react";
import { useState } from "react";

import type { ColorName } from "metabase/lib/colors/types";
import { Icon, type IconName, Tooltip } from "metabase/ui";

import {
  IconContainer,
  PermissionsSelectLabel,
  PermissionsSelectOptionRoot,
} from "./PermissionsSelectOption.styled";

interface PermissionsSelectOptionProps {
  label: ReactNode;
  icon: IconName;
  iconColor: ColorName;
  className?: string;
  hint?: string;
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
