import { Text } from "@mantine/core";
import type { MantineThemeComponents } from "@mantine/core";

export const getTextOverrides = (): MantineThemeComponents => ({
  Text: Text.extend({
    defaultProps: {
      color: "text.2",
    },
  }),
});
