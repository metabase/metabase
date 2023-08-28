import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { rem } from "@mantine/core";
import { color } from "metabase/lib/colors";
import {
  getAccordionOverrides,
  getAnchorOverrides,
  getButtonOverrides,
  getCheckboxOverrides,
  getInputOverrides,
  getMenuOverrides,
  getNumberInputOverrides,
  getRadioOverrides,
  getTextInputOverrides,
  getTextOverrides,
  getTitleOverrides,
} from "./components";

type ThemeColors = MantineTheme["colors"]["brand"];

const getThemeColors = (colors: string[]): ThemeColors => {
  return Array.from(
    { length: 10 },
    (_, index) => colors[index] ?? "transparent",
  ) as ThemeColors;
};

export const getThemeOverrides = (): MantineThemeOverride => ({
  colors: {
    brand: getThemeColors([color("brand-lighter"), color("brand")]),
    text: getThemeColors([
      color("text-light"),
      color("text-medium"),
      color("text-dark"),
    ]),
    focus: getThemeColors([color("focus")]),
    border: getThemeColors([color("border")]),
    bg: getThemeColors([
      color("bg-light"),
      color("bg-medium"),
      color("bg-dark"),
    ]),
    error: getThemeColors([color("error")]),
  },
  primaryColor: "brand",
  primaryShade: 1,
  shadows: {
    md: "0px 4px 20px 0px rgba(0, 0, 0, 0.05)",
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  radius: {
    xs: "4px",
    sm: "6px",
    md: "8px",
    xl: "40px",
  },
  fontSizes: {
    xs: rem(11),
    sm: rem(12),
    md: rem(14),
    lg: rem(17),
    xl: rem(21),
  },
  lineHeight: "1rem",
  headings: {
    sizes: {
      h1: {
        fontSize: rem(24),
        lineHeight: rem(24),
      },
      h2: {
        fontSize: rem(20),
        lineHeight: rem(24),
      },
      h3: {
        fontSize: rem(14),
        lineHeight: rem(16),
      },
      h4: {
        fontSize: rem(14),
        lineHeight: rem(16),
      },
    },
  },
  fontFamily: "var(--default-font-family)",
  fontFamilyMonospace: "Monaco, monospace",
  focusRingStyles: {
    styles: theme => ({
      outline: `0.125rem solid ${theme.colors.focus[0]}`,
      outlineOffset: "0.125rem",
    }),
  },
  components: {
    ...getAccordionOverrides(),
    ...getAnchorOverrides(),
    ...getButtonOverrides(),
    ...getCheckboxOverrides(),
    ...getInputOverrides(),
    ...getMenuOverrides(),
    ...getNumberInputOverrides(),
    ...getRadioOverrides(),
    ...getTextInputOverrides(),
    ...getTextOverrides(),
    ...getTitleOverrides(),
  },
});
