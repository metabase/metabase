import React, { useCallback, useMemo } from "react";

import type { Dashboard } from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";

import ActionButtonView from "./ActionButtonView";

interface ActionButtonProps extends VisualizationProps {
  dashboard: Dashboard;
}

function ActionButton({
  isSettings,
  settings,
  getExtraDataForClick,
  onVisualizationClick,
}: ActionButtonProps) {
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
    <ActionButtonView
      onClick={onClick}
      settings={settings}
      isFullHeight={!isSettings}
    />
  );
}

export default ActionButton;
