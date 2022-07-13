import React from "react";
import { t } from "ttag";
import { LighthouseSetting } from "./types";
import ImageToggle from "../ImageToggle";
import { LighthouseImage } from "./LighthouseToggleWidget.styled";

interface LighthouseToggleWidgetProps {
  setting: LighthouseSetting;
  onChange: (value: boolean) => void;
}

const LighthouseToggleWidget = ({
  setting,
  onChange,
}: LighthouseToggleWidgetProps): JSX.Element => {
  const isEnabled = setting.value ?? setting.default;

  return (
    <ImageToggle
      label={t`Show this on the home and login pages`}
      value={isEnabled}
      onChange={onChange}
    >
      <LighthouseImage
        src="app/img/bridge.svg"
        alt={t`Lighthouse illustration`}
      />
    </ImageToggle>
  );
};

export default LighthouseToggleWidget;
