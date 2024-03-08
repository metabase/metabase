import { t } from "ttag";

import ImageToggle from "../ImageToggle";

import { MetabotIcon } from "./MetabotToggleWidget.styled";
import type { MetabotSetting } from "./types";

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
