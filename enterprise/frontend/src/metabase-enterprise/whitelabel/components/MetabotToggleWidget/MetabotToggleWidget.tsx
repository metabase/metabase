import React from "react";
import { t } from "ttag";
import { MetabotSetting } from "./types";
import ImageToggle from "../ImageToggle";
import { MetabotImage } from "./MetabotToggleWidget.styled";

interface MetabotToggleWidgetProps {
  setting: MetabotSetting;
  onChange: (value: boolean) => void;
}

const MetabotToggleWidget = ({
  setting,
  onChange,
}: MetabotToggleWidgetProps): JSX.Element => {
  const isEnabled = setting.value ?? setting.default;
  const metabotImage = isEnabled ? "metabot-happy" : "metabot-sad";

  return (
    <ImageToggle
      label={t`Display our little friend on the homepage`}
      value={isEnabled}
      onChange={onChange}
    >
      <MetabotImage
        src={`app/assets/img/${metabotImage}.gif`}
        alt={t`Metabot`}
      />
    </ImageToggle>
  );
};

export default MetabotToggleWidget;
