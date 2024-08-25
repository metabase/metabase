import cx from "classnames";

import type { PillSize } from "metabase/core/components/ColorPill";
import ColorSelector from "metabase/core/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import { getAccentColors } from "metabase/lib/colors/groups";

interface ChartSettingColorPickerProps {
  className?: string;
  value: string;
  title?: string;
  pillSize?: PillSize;
  onChange?: (newValue: string) => void;
  includeLightAndDarkColors?: boolean;
}

export const ChartSettingColorPicker = ({
  className,
  value,
  title,
  pillSize,
  onChange,
  includeLightAndDarkColors = true,
}: ChartSettingColorPickerProps) => {
  return (
    <div className={cx(CS.flex, CS.alignCenter, CS.mb1, className)}>
      <ColorSelector
        value={value}
        colors={getAccentColors(
          includeLightAndDarkColors
            ? { main: true, light: true, dark: true, harmony: false }
            : { main: true, light: false, dark: false, harmony: false },
        )}
        onChange={onChange}
        pillSize={pillSize}
      />
      {title && <h4 className={CS.ml1}>{title}</h4>}
    </div>
  );
};
