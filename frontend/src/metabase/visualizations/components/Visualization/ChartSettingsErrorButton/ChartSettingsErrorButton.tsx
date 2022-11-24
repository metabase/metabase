import React from "react";

import Button from "metabase/core/components/Button";

import type { VisualizationSettings } from "metabase-types/api";

import { ButtonContainer } from "./ChartSettingsErrorButton.styled";

interface Props {
  message: string;
  buttonLabel: string;
  onClick: (initial: VisualizationSettings) => void;
}

function ChartSettingsErrorButton({ message, buttonLabel, onClick }: Props) {
  return (
    <div>
      <div>{message}</div>
      <ButtonContainer>
        <Button primary medium onClick={onClick}>
          {buttonLabel}
        </Button>
      </ButtonContainer>
    </div>
  );
}

export default ChartSettingsErrorButton;
