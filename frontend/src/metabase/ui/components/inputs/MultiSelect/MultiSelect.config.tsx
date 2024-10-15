import {
  type MantineThemeOverride,
  MultiSelect,
  getSize,
  rem,
} from "@mantine/core";
// TODO: variants
// TODO: variants

import { SelectItem } from "../Select";

// import { SelectDropdown } from "../Select/SelectDropdown";
import S from "./MultiSelect.module.css";

const SIZES = {
  xs: rem(30),
  md: rem(38),
};

const VALUE_SIZES = {
  xs: rem(20),
  md: rem(28),
};

const RIGHT_SECTION_SIZES = {
  default: rem(40),
  unstyled: rem(28),
};

export const multiSelectOverrides: MantineThemeOverride["components"] = {
  MultiSelect: MultiSelect.extend({
    defaultProps: {
      radius: "sm",
      size: "md",
      variant: "default",
      renderOption: props => (
        <SelectItem {...props.option} selected={props.checked} />
      ),
      /* FIXME: I'm not sure how to port this
      dropdownComponent: SelectDropdown,
      scrollAreaProps might be useful
       */
      comboboxProps: {
        withinPortal: true,
      },
      clearButtonProps: {
        color: "text-dark",
      },
      "data-testid": "multi-select",
    },
    classNames: {
      input: S.MultiSelectInput,
      options: S.MultiSelectOptions,
      option: S.MultiSelectOption,
      inputField: S.MultiSelectInputField,
      dropdown: S.MultiSelectDropdown,
      // FIXME: An icon used to be part of this component but it isn't any longer. Need to investigate
      // icon: S.MultiSelectIcon,
    },
    vars: (theme, props, _ctx) => ({
      root: {
        "--multiselect-section-size":
          props.variant === "unstyled"
            ? RIGHT_SECTION_SIZES.unstyled
            : RIGHT_SECTION_SIZES.default,
        "--multiselect-options-min-height": getSize({
          size: props.size,
          sizes: SIZES,
        }),
        "--multiselect-option-height": getSize({
          size: props.size,
          sizes: VALUE_SIZES,
        }),
        "--multiselect-option-font-size": getSize({
          size: props.size,
          sizes: theme.fontSizes,
        }),
      },
    }),
  }),
};
