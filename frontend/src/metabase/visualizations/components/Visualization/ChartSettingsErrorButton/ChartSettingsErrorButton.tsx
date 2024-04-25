import Button from "metabase/core/components/Button";
import type { VisualizationSettings } from "metabase-types/api";

import { ButtonContainer } from "./ChartSettingsErrorButton.styled";

interface ChartSettingsErrorButtonProps {
  message: string;
  buttonLabel: string;
  onClick: (initial: VisualizationSettings) => void;
}

function ChartSettingsErrorButton({
  message,
  buttonLabel,
  onClick,
}: ChartSettingsErrorButtonProps) {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsErrorButton;
