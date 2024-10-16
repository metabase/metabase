import type {
  InputVariant,
  SelectProps,
  SelectStylesNames,
} from "@mantine/core";
import type { ExtendsRootComponent } from "@mantine/core/lib/core/factory/factory";

import S from "./SelectInput.module.css";

type SelectInputComponent = ExtendsRootComponent<{
  props: SelectProps;
  ref: HTMLInputElement;
  stylesNames: SelectStylesNames;
  variant: InputVariant;
}>;

type SelectInputClasses = SelectInputComponent["classNames"];
type SelectInputVariables = SelectInputComponent["vars"];

export const selectInputClassNames: SelectInputClasses = {
  input: S.SelectInput,
  section: S.SelectInputSection,
};

export const selectInputVars: Exclude<SelectInputVariables, undefined> = (
  _theme,
  { size: _size = "md" },
) => ({
  root: {
    // Variable overrides go here
  },
});
