import { Chip, type MantineThemeOverride } from "@mantine/core";

import S from "./Chip.module.css";

const SIZE_VARS: Record<
  string,
  { height: string; paddingInline: string; fontSize: string }
> = {
  sm: { height: "1.5rem", paddingInline: "0.5rem", fontSize: "0.75rem" },
  md: { height: "2rem", paddingInline: "0.75rem", fontSize: "0.875rem" },
};

export const chipOverrides: MantineThemeOverride["components"] = {
  Chip: Chip.extend({
    defaultProps: {
      size: "md",
      variant: "light",
    },
    classNames: {
      root: S.ChipRoot,
      label: S.ChipLabel,
      iconWrapper: S.ChipIconWrapper,
      checkIcon: S.ChipCheckIcon,
    },
    vars: (_theme, props) => {
      const size = SIZE_VARS[props.size as string] ?? SIZE_VARS.md;
      return {
        root: {
          "--chip-size": size.height,
          "--chip-padding": size.paddingInline,
          "--chip-fz": size.fontSize,
        },
      };
    },
  }),
};
