import React, { useCallback, useMemo } from "react";

import type { Dashboard } from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";

import { StyledButton } from "./ActionButton.styled";

interface ActionButtonProps extends VisualizationProps {
  dashboard: Dashboard;
}

function ActionButton({
  isSettings,
  settings,
  getExtraDataForClick,
  onVisualizationClick,
}: ActionButtonProps) {
  const label = settings["button.label"];
  const variant = settings["button.variant"];

  const variantProps: any = {};
  if (variant !== "default") {
    variantProps[variant] = true;
  }

  const clickObject = useMemo(() => ({ settings }), [settings]);

  const extraData = useMemo(
    () => getExtraDataForClick?.(clickObject),
    [clickObject, getExtraDataForClick],
  );

  const onClick = useCallback(() => {
    onVisualizationClick({
      ...clickObject,
      extraData,
    });
  }, [clickObject, extraData, onVisualizationClick]);

  return (
    <StyledButton
      onClick={onClick}
      isFullHeight={!isSettings}
      {...variantProps}
    >
      {label}
    </StyledButton>
  );
}

export default ActionButton;
