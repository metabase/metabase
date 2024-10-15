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

//
// export const getSelectInputOverrides = (
//   theme: MantineTheme,
// ): Record<string, CSSObject> => {
//   return {
//     rightSection: {
//       ref: getStylesRef("rightSection"),
//       color: "var(--mb-color-text-primary)",

//       svg: {
//         color: "inherit !important",
//         width: "1rem !important",
//         height: "1rem !important",

//         "&[data-chevron] path": {
//           d: 'path("M 1.3781 4.1906 a 0.7031 0.7031 90 0 1 0.9938 0 L 7.5 9.3187 l 5.1281 -5.1281 a 0.7031 0.7031 90 1 1 0.9938 0.9938 l -5.625 5.625 a 0.7031 0.7031 90 0 1 -0.9938 0 l -5.625 -5.625 a 0.7031 0.7031 90 0 1 0 -0.9938 z")',
//         },
//         "&:not([data-chevron]) path": {
//           d: 'path("4.2469 3.2531 a 0.7031 0.7031 90 0 0 -0.9938 0.9938 L 6.5063 7.5 l -3.2531 3.2531 a 0.7031 0.7031 90 1 0 0.9938 0.9938 L 7.5 8.4938 l 3.2531 3.2531 a 0.7031 0.7031 90 1 0 0.9938 -0.9938 L 8.4938 7.5 l 3.2531 -3.2531 a 0.7031 0.7031 90 0 0 -0.9938 -0.9938 L 7.5 6.5063 L 4.2469 3.2531 z")',
//         },
//       },
//     },
//   };
// };
