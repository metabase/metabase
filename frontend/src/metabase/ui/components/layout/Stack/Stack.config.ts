import { type MantineThemeOverride, Stack } from "@mantine/core";

export const stackOverrides: MantineThemeOverride["components"] = {
  Stack: Stack.extend({
    defaultProps: {
      // Mantine's default is `gap: "md"`, which is 12px in the new scale.
      // Pin the gap to "lg" (16px) to preserve the previous default.
      gap: "lg",
    },
  }),
};
