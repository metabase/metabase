import cx from "classnames";
import { getAccentColors } from "metabase/lib/colors/groups";
import type { PillSize } from "metabase/core/components/ColorPill";
import ColorSelector from "metabase/core/components/ColorSelector";

interface ChartSettingColorPickerProps {
  className?: string;
  value: string;
  title?: string;
  pillSize?: PillSize;
  onChange?: (newValue: string) => void;
}

export const ChartSettingColorPicker = ({
  className,
  value,
  title,
  pillSize,
  onChange,
}: ChartSettingColorPickerProps) => {
  return (
    <div className={cx("flex align-center mb1", className)}>
      <ColorSelector
        value={value}
        colors={getAccentColors()}
        onChange={onChange}
        pillSize={pillSize}
      />
      {title && <h4 className="ml1">{title}</h4>}
    </div>
  );
};
