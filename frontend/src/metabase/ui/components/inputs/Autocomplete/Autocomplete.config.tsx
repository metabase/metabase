import { Autocomplete, type MantineThemeOverride } from "@mantine/core";

export const autocompleteOverrides: MantineThemeOverride["components"] = {
  Autocomplete: Autocomplete.extend({
    defaultProps: {
      size: "md",
      comboboxProps: {
        withinPortal: true,
      },
      maxDropdownHeight: 512,
      withScrollArea: false,
    },
  }),
};
