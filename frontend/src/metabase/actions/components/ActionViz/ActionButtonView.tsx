import React from "react";
import { t } from "ttag";

import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";

import type { VisualizationProps } from "metabase-types/types/Visualization";

import { StyledButton, StyledButtonContent } from "./ActionButton.styled";

interface ActionButtonViewProps extends Pick<VisualizationProps, "settings"> {
  disabled?: boolean;
  icon?: string;
  tooltip?: string;
  isFullHeight?: boolean;
  onClick?: () => void;
  focus?: boolean;
}

function ActionButtonView({
  settings,
  disabled,
  icon,
  tooltip,
  isFullHeight,
  onClick,
  focus,
}: ActionButtonViewProps) {
  const label = settings["button.label"];
  const variant = settings["button.variant"] ?? "primary";

  const variantProps: any = {};
  if (variant !== "default") {
    variantProps[variant] = true;
  }

  return (
    <StyledButton
      disabled={!!disabled}
      onClick={onClick}
      fullWidth
      isFullHeight={isFullHeight}
      focus={focus}
      aria-label={tooltip}
      {...variantProps}
    >
      <StyledButtonContent>
        {icon && <Icon name={icon} />}
        <Ellipsified>{label ?? t`Click me`}</Ellipsified>
      </StyledButtonContent>
    </StyledButton>
  );
}

export default ActionButtonView;
