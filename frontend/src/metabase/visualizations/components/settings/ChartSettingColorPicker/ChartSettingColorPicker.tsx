import cx from "classnames";

import type { PillSize } from "metabase/common/components/ColorPill";
import { ColorSelector } from "metabase/common/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getAccentColors } from "metabase/lib/colors/groups";
import type { AccentColorOptions } from "metabase/lib/colors/types";
import { Box, type BoxProps } from "metabase/ui";

interface ChartSettingColorPickerProps extends BoxProps {
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
  accentColorOptions = {
    main: true,
    light: true,
    dark: true,
    harmony: false,
    gray: true,
  },
  ...boxProps
}: ChartSettingColorPickerProps) => {
  // For the SDK the ColorSelector is rendered inside a parent Mantine popover,
  // so as a nested popover it should not be rendered within a portal
  const withinPortal = !isEmbeddingSdk();

  return (
    <Box className={cx(CS.flex, CS.alignCenter, className)} {...boxProps}>
      <ColorSelector
        value={value}
        colors={getAccentColors(accentColorOptions)}
        withinPortal={withinPortal}
        onChange={onChange}
        pillSize={pillSize}
      />
      {title && <h4 className={CS.ml1}>{title}</h4>}
    </Box>
  );
};
