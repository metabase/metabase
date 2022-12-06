import React, { useCallback } from "react";

import type { VisualizationProps } from "metabase-types/types/Visualization";

import ActionButtonView from "./ActionButtonView";

interface DefaultActionButtonProps {
  isSettings: VisualizationProps["isSettings"];
  settings: VisualizationProps["settings"];
  onVisualizationClick: VisualizationProps["onVisualizationClick"];
}

function LinkButton({
  isSettings,
  settings,
  onVisualizationClick,
}: DefaultActionButtonProps) {
  const onClick = useCallback(
    () => onVisualizationClick({ settings }),
    [onVisualizationClick, settings],
  );

  return (
    <ActionButtonView
      onClick={onClick}
      settings={settings}
      isFullHeight={!isSettings}
    />
  );
}

export default LinkButton;
