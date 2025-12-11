import type { ReactNode } from "react";

import Button from "metabase/common/components/Button";
import type { VisualizationSettings } from "metabase-types/api";

import S from "./ChartSettingsErrorButton.module.css";

interface ChartSettingsErrorButtonProps {
  message: ReactNode;
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
      <div className={S.ButtonContainer}>
        <Button primary medium onClick={onClick}>
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsErrorButton;
