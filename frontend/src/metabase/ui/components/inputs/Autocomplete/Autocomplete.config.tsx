import type { AutocompleteFactory, MantineThemeOverride } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

export const autocompleteOverrides: MantineThemeOverride["components"] = {
  Autocomplete: themeComponent<AutocompleteFactory>({
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
