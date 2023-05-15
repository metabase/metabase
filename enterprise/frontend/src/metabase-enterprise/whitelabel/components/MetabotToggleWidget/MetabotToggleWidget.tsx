import React from "react";
import { t } from "ttag";
import ImageToggle from "../ImageToggle";
import { MetabotSetting } from "./types";
import { MetabotIcon } from "./MetabotToggleWidget.styled";

interface MetabotToggleWidgetProps {
  setting: MetabotSetting;
  onChange: (value: boolean) => void;
}

const MetabotToggleWidget = ({
  setting,
  onChange,
}: MetabotToggleWidgetProps): JSX.Element => {
  const isEnabled = setting.value ?? setting.default;

  return (
    <ImageToggle
      label={t`Display welcome message on the homepage`}
      value={isEnabled}
      onChange={onChange}
    >
      <MetabotIcon variant={isEnabled ? "happy" : "sad"} />
    </ImageToggle>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetabotToggleWidget;
