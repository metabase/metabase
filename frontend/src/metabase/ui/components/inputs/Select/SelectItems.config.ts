import {
  type InputVariant,
  type SelectProps,
  type SelectStylesNames,
  getSize,
  rem,
} from "@mantine/core";
import type { ExtendsRootComponent } from "@mantine/core/lib/core/factory/factory";

import { getItemFontSize, getItemLineHeight } from "./SelectItem/utils";
import S from "./SelectItems.module.css";

const GROUP_LABEL_FONT_SIZES = {
  xs: rem(12),
  md: rem(12),
};

type SelectItemsComponent = ExtendsRootComponent<{
  props: SelectProps;
  ref: HTMLInputElement;
  stylesNames: SelectStylesNames;
  variant: InputVariant;
}>;

type SelectItemsClasses = SelectItemsComponent["classNames"];
type SelectItemsVariables = SelectItemsComponent["vars"];

export const selectItemsClassNames: SelectItemsClasses = {
  option: S.SelectItems_Item,
  options: S.SelectItems_Options,
  group: S.SelectItems_Group,
  groupLabel: S.SelectItems_GroupLabel,
  empty: S.SelectItemsNothingFound,
};

export const selectItemsVars: Exclude<SelectItemsVariables, undefined> = (
  _theme,
  { size = "md" },
) => ({
  root: {
    "--select-item-font-size": getItemFontSize(size),
    "--select-item-group-label-font-size": getSize({
      size,
      sizes: GROUP_LABEL_FONT_SIZES,
    }),
    "--select-item-line-height": getItemLineHeight(size),
  },
});
