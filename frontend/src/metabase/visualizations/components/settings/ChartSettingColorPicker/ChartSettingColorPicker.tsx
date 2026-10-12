import cx from "classnames";

import type { PillSize } from "metabase/common/components/ColorPill";
import { ColorSelector } from "metabase/common/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { Box } from "metabase/ui";
import { getNamedAccentColors } from "metabase/ui/colors/groups";
import type { AccentColorOptions } from "metabase/ui/colors/types";

interface ChartSettingColorPickerProps {
  className?: string;
  value: string;
  title?: string;
  pillSize?: PillSize;
  /**
   * Reports the palette color name of the picked color to onChange. Off by
   * default because the settings widget framework treats the second onChange
   * argument as a Question override.
   */
  forwardColorName?: boolean;
  onChange?: (hexValue: string, colorName?: string) => void;
  accentColorOptions?: AccentColorOptions;
}

export const ChartSettingColorPicker = ({
  className,
  value,
  title,
  pillSize,
  forwardColorName,
  onChange,
  accentColorOptions = {
    main: true,
    light: true,
    dark: true,
    harmony: false,
    gray: true,
  },
}: ChartSettingColorPickerProps) => {
  // For the SDK the ColorSelector is rendered inside a parent Mantine popover,
  // so as a nested popover it should not be rendered within a portal
  const withinPortal = !isEmbeddingSdk();

  return (
    <Box className={cx(CS.flex, CS.alignCenter, className)}>
      <ColorSelector
        value={value}
        colors={getNamedAccentColors(accentColorOptions)}
        withinPortal={withinPortal}
        onChange={(hexValue, colorName) =>
          onChange?.(hexValue, forwardColorName ? colorName : undefined)
        }
        pillSize={pillSize}
      />
      {title && <h4 className={CS.ml1}>{title}</h4>}
    </Box>
  );
};
