import { type MantineThemeOverride, Select, rem } from "@mantine/core";

import S from "./Select.module.css";
import { selectInputClassNames, selectInputVars } from "./SelectInput.config";
import { SelectItem } from "./SelectItem";
import { selectItemsClassNames, selectItemsVars } from "./SelectItems.config";

export const selectOverrides: MantineThemeOverride["components"] = {
  Select: Select.extend({
    defaultProps: {
      size: "md",
      maxDropdownHeight: 512,
      withScrollArea: true,
      renderOption: item => (
        <SelectItem
          // TODO: Support icons again
          // icon={item.option.icon}
          label={item.option.label}
          value={item.option.value}
        />
      ),
      clearButtonProps: {
        color: "text-dark",
      },
      comboboxProps: {
        withinPortal: true,
      },
      // dropdownComponent: SelectDropdown,
      // FIXME: The dropdownComponent prop is no longer supported.  Let's see what happens if I
      // disable it. This may not be necessary because perhaps the Selects are
      // no longer inside any TippyPopovers. Sloan thinks it is fine to remove
      // this prop. It might be necessary to set it on the combobox.
      //
    },
    classNames: {
      root: S.SelectRoot,
      wrapper: S.SelectWrapper,
      label: S.SelectLabel,
      error: S.SelectError,
      description: S.SelectDescription,
      ...selectItemsClassNames,
      ...selectInputClassNames,
    },
    vars: (...params) => ({
      ...selectItemsVars(...params),
      ...selectInputVars(...params), // TODO:
    }),
  }),
};

// FIXME: Use this in the grouplabel if needed
const _SEPARATOR_FONT_SIZES = {
  xs: rem(12),
  md: rem(12),
};
