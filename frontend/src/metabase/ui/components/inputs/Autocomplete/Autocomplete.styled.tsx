import type { MantineThemeOverride } from "@mantine/core";

import { CustomSelectDropdown } from "../Select/CustomSelectDropdown";
import { CustomSelectItem } from "../Select/CustomSelectItem";
import {
  getSelectInputOverrides,
  getSelectItemsOverrides,
} from "../Select/Select.styled";

export const getAutocompleteOverrides =
  (): MantineThemeOverride["components"] => ({
    Autocomplete: {
      defaultProps: () => ({
        size: "md",
        withinPortal: true,
        dropdownComponent: CustomSelectDropdown,
        itemComponent: CustomSelectItem,
        maxDropdownHeight: 512,
      }),
      styles: (theme, _, { size = "md" }) => ({
        ...getSelectInputOverrides(theme),
        ...getSelectItemsOverrides(theme, size),
      }),
    },
  });
