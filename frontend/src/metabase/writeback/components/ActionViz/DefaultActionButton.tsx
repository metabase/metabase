import React, { useCallback, useMemo } from "react";

import type { VisualizationProps } from "metabase-types/types/Visualization";
import type {
  OnSubmitActionForm,
  WritebackParameter,
} from "metabase-types/api";

import ActionButtonView from "./ActionButtonView";

interface DefaultActionButtonProps {
  isSettings: VisualizationProps["isSettings"];
  settings: VisualizationProps["settings"];
  getExtraDataForClick: VisualizationProps["getExtraDataForClick"];
  onVisualizationClick: VisualizationProps["onVisualizationClick"];
  onSubmit: OnSubmitActionForm;
  missingParameters: WritebackParameter[];
}

function DefaultActionButton({
  isSettings,
  settings,
  getExtraDataForClick,
  onVisualizationClick,
  onSubmit,
  missingParameters,
}: DefaultActionButtonProps) {
  const clickObject = useMemo(
    () => ({ settings, onSubmit, missingParameters }),
    [settings, onSubmit, missingParameters],
  );

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

export default DefaultActionButton;
