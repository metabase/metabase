import { Group, type MantineThemeOverride } from "@mantine/core";

export const groupOverrides: MantineThemeOverride["components"] = {
  Group: Group.extend({
    defaultProps: {
      // Mantine's default is `gap: "md"`, which is 12px in the new scale.
      // Pin the gap to "lg" (16px) to preserve the previous default.
      gap: "lg",
    },
  }),
};
