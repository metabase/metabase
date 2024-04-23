import { t } from "ttag";

import { ImageToggle } from "../ImageToggle";

import { MetabotIcon } from "./MetabotToggleWidget.styled";
import type { MetabotSetting } from "./types";
import {ReactNode} from "react";

interface MetabotToggleWidgetProps {
  setting: MetabotSetting;
  onChange: (value: boolean) => void;
}

export const MetabotToggleWidget = ({
  setting,
  onChange,
}: MetabotToggleWidgetProps): ReactNode => {
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
