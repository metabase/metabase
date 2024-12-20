import { Autocomplete, type MantineThemeOverride } from "@mantine/core";

import { selectOverrides } from "../Select";
import { SelectItem } from "../Select/SelectItem";

export const autocompleteOverrides: MantineThemeOverride["components"] = {
  Autocomplete: Autocomplete.extend({
    defaultProps: {
      size: "md",
      comboboxProps: {
        withinPortal: true,
      },
      renderOption: item => <SelectItem {...item.option} />,
      maxDropdownHeight: 512,
      withScrollArea: false,
    },
    classNames: {
      ...selectOverrides.Select.classNames,
    },
  }),
};
