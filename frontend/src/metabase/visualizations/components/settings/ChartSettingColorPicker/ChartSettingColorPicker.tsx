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
  bordered?: boolean;
  /**
   * Reports the palette color name of the picked color to onChange. Off by
   * default because the settings widget framework treats the second onChange
   * argument as a Question override.
   */
  forwardColorName?: boolean;
  /**
   * Must be false when the picker is rendered inside a parent Mantine popover,
   * where a portaled color dropdown registers as an outside click and closes
   * the parent before the selection is applied.
   */
  withinPortal?: boolean;
  onChange?: (hexValue: string, colorName?: string) => void;
  accentColorOptions?: AccentColorOptions;
}

export const ChartSettingColorPicker = ({
  className,
  value,
  title,
  pillSize,
  bordered,
  forwardColorName,
  // the SDK renders chart settings inside a parent Mantine popover
  withinPortal = !isEmbeddingSdk(),
  onChange,
  accentColorOptions = {
    main: true,
    light: true,
    dark: true,
    harmony: false,
    gray: true,
  },
}: ChartSettingColorPickerProps) => {
  return (
    <Box
      className={cx(CS.flex, CS.alignCenter, className)}
      py={bordered ? "md" : undefined}
      px={bordered ? "lg" : undefined}
      bd={bordered ? "1px solid var(--mb-color-border-neutral)" : undefined}
      bdrs={bordered ? "sm" : undefined}
    >
      <ColorSelector
        value={value}
        colors={getNamedAccentColors(accentColorOptions)}
        withinPortal={withinPortal}
        onChange={(hexValue, colorName) =>
          onChange?.(hexValue, forwardColorName ? colorName : undefined)
        }
        pillSize={pillSize}
      />
      {title && <h4 className={bordered ? CS.ml2 : CS.ml1}>{title}</h4>}
    </Box>
  );
};
