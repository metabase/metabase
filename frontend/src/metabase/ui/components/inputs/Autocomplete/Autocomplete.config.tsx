import { Autocomplete, type MantineThemeOverride } from "@mantine/core";

import { selectInputClassNames } from "../Select/SelectInput.config";
import { SelectItem } from "../Select/SelectItem";
import { selectItemsClassNames } from "../Select/SelectItems.config";

export const autocompleteOverrides: MantineThemeOverride["components"] = {
  Autocomplete: Autocomplete.extend({
    defaultProps: {
      size: "md",
      comboboxProps: {
        withinPortal: true,
      },
      // dropdownComponent: SelectDropdown,
      renderOption: item => (
        <SelectItem
          // TODO: Support icons again
          // icon={item.option.icon}
          label={item.option.label}
          value={item.option.value}
        />
      ),
      maxDropdownHeight: 512,
      withScrollArea: true,
    },
    classNames: {
      ...selectItemsClassNames,
      ...selectInputClassNames,
    },
    // styles: (theme, _, { size = "md" }) => ({
    //   ...getSelectInputOverrides(theme),
    //   ...getSelectItemsOverrides(theme, size),
    // }),
  }),
};
