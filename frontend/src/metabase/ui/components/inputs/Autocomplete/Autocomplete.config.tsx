import { Autocomplete, type MantineThemeOverride } from "@mantine/core";

export const autocompleteOverrides: MantineThemeOverride["components"] = {
  Autocomplete: Autocomplete.extend({
    defaultProps: {
      size: "md",
      comboboxProps: {
        withinPortal: true,
        // A closed dropdown must unmount, or it stays on the overlay stack above a modal it sits in
        keepMounted: false,
      },
      maxDropdownHeight: 512,
      withScrollArea: false,
    },
  }),
};
