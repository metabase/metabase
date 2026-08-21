import { Loader, type MantineThemeOverride, getSize, rem } from "@mantine/core";

import S from "./Loader.module.css";

const SIZES: Record<string, string> = {
  xs: rem(12),
  sm: rem(14),
  md: rem(16),
  lg: rem(18),
  xl: rem(22),
};

export const loaderOverrides: MantineThemeOverride["components"] = {
  Loader: Loader.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      root: S.root,
    },
    vars: (_theme, { size = "md", color }) => ({
      root: {
        "--loader-size": SIZES[size] ?? getSize(size, "loader-size"),
        "--loader-color": color ? undefined : "var(--mb-color-icon-brand)",
      },
    }),
  }),
};
