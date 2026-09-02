import { type MantineThemeOverride, SimpleGrid } from "@mantine/core";

export const simpleGridOverrides: MantineThemeOverride["components"] = {
  SimpleGrid: SimpleGrid.extend({
    defaultProps: {
      // Mantine's default is `spacing: "md"`, which is 12px in the new scale.
      // Pin the spacing to "lg" (16px) to preserve the previous default.
      spacing: "lg",
    },
  }),
};
