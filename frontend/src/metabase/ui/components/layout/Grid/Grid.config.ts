import { Grid, type MantineThemeOverride } from "@mantine/core";

export const gridOverrides: MantineThemeOverride["components"] = {
  Grid: Grid.extend({
    defaultProps: {
      // Mantine's default is `gutter: "md"`, which is 12px in the new scale.
      // Pin the gutter to "lg" (16px) to preserve the previous default.
      gutter: "lg",
    },
  }),
};
