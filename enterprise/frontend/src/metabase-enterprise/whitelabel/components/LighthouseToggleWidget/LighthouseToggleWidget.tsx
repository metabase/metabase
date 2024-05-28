import { t } from "ttag";

import { ImageToggle } from "../ImageToggle";

import { LighthouseImage } from "./LighthouseToggleWidget.styled";
import type { LighthouseSetting } from "./types";

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
      <LighthouseImage />
    </ImageToggle>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LighthouseToggleWidget;
