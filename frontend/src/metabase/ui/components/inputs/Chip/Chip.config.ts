import { Chip, type MantineThemeOverride } from "@mantine/core";

import S from "./Chip.module.css";

const SIZE_VARS: Record<string, { height: string; paddingInline: string }> = {
  sm: { height: "1.5rem", paddingInline: "0.5rem" },
  md: { height: "2rem", paddingInline: "0.75rem" },
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
    vars: (_theme, { size = "md" }) => {
      const { height, paddingInline } = SIZE_VARS[size];
      return {
        root: {
          "--chip-size": height,
          "--chip-padding": paddingInline,
        },
      };
    },
  }),
};
