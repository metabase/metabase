import { Combobox, type MantineThemeOverride } from "@mantine/core";

export const comboboxOverrides: MantineThemeOverride["components"] = {
  Combobox: Combobox.extend({
    defaultProps: {
      size: "md",
    },
  }),
};
