import React from "react";
import { t } from "ttag";

import type { VisualizationProps } from "metabase-types/types/Visualization";

import { StyledButton } from "./ActionButton.styled";

interface ActionButtonViewProps extends Pick<VisualizationProps, "settings"> {
  isFullHeight?: boolean;
  onClick: () => void;
}

function ActionButtonView({
  settings,
  isFullHeight,
  onClick,
}: ActionButtonViewProps) {
  const label = settings["button.label"];
  const variant = settings["button.variant"] ?? "primary";

  const variantProps: any = {};
  if (variant !== "default") {
    variantProps[variant] = true;
  }

  return (
    <StyledButton
      onClick={onClick}
      isFullHeight={isFullHeight}
      {...variantProps}
    >
      {label ?? t`Click me`}
    </StyledButton>
  );
}

export default ActionButtonView;
