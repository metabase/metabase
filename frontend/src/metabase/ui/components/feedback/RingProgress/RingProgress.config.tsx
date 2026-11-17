import { type MantineThemeOverride, RingProgress } from "@mantine/core";

export const ringProgressOverrides: MantineThemeOverride["components"] = {
  RingProgress: RingProgress.extend({
    defaultProps: {
      // Mantine's default track is `gray-2`, which is outside Metabase's palette
      rootColor: "border-neutral",
    },
  }),
};
