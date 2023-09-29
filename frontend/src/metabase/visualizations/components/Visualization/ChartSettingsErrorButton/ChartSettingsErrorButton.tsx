import Button from "metabase/core/components/Button";

import { ButtonContainer } from "./ChartSettingsErrorButton.styled";

interface ChartSettingsErrorButtonProps {
  message: string;
  buttonLabel: string;
  onClick: () => void;
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
