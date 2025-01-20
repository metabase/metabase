import { Chip, type MantineThemeOverride } from "@mantine/core";

import S from "./Chip.module.css";

export const chipOverrides: MantineThemeOverride["components"] = {
  Chip: Chip.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      label: S.ChipLabel,
      iconWrapper: S.ChipIconWrapper,
      input: S.ChipInput,
    },
  }),
};
