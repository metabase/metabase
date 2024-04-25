import type { MantineThemeOverride } from "@mantine/core";

import {
  getSelectInputOverrides,
  getSelectItemsOverrides,
} from "../Select/Select.styled";
import { SelectDropdown } from "../Select/SelectDropdown";
import { SelectItem } from "../Select/SelectItem";

export const getAutocompleteOverrides =
  (): MantineThemeOverride["components"] => ({
    Autocomplete: {
      defaultProps: () => ({
        size: "md",
        withinPortal: true,
        dropdownComponent: SelectDropdown,
        itemComponent: SelectItem,
        maxDropdownHeight: 512,
      }),
      styles: (theme, _, { size = "md" }) => ({
        ...getSelectInputOverrides(theme),
        ...getSelectItemsOverrides(theme, size),
      }),
    },
  });
