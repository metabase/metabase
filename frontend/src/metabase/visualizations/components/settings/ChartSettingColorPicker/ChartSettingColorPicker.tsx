import cx from "classnames";

import type { PillSize } from "metabase/core/components/ColorPill";
import ColorSelector from "metabase/core/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import { getAccentColors } from "metabase/lib/colors/groups";
import type { AccentColorOptions } from "metabase/lib/colors/types";

interface ChartSettingColorPickerProps {
  className?: string;
  value: string;
  title?: string;
  pillSize?: PillSize;
  onChange?: (newValue: string) => void;
  accentColorOptions?: AccentColorOptions;
}

export const ChartSettingColorPicker = ({
  className,
  value,
  title,
  pillSize,
  onChange,
  accentColorOptions = { main: true, light: true, dark: true, harmony: false },
}: ChartSettingColorPickerProps) => {
  return (
    <div className={cx(CS.flex, CS.alignCenter, CS.mb1, className)}>
      <ColorSelector
        value={value}
        colors={getAccentColors(accentColorOptions)}
        onChange={onChange}
        pillSize={pillSize}
      />
      {title && <h4 className={CS.ml1}>{title}</h4>}
    </div>
  );
};
