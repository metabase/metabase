import type { MantineThemeOverride } from "@mantine/core";
import { rem } from "@mantine/core";
import { color } from "metabase/lib/colors";
import {
  getAccordionOverrides,
  getAnchorOverrides,
  getButtonOverrides,
  getCheckboxOverrides,
  getInputOverrides,
  getMenuOverrides,
  getRadioOverrides,
  getTextOverrides,
  getTitleOverrides,
} from "./components";

export const getThemeOverrides = (): MantineThemeOverride => ({
  colors: {
    brand: [color("brand-lighter"), color("focus"), color("brand")],
    text: [color("text-light"), color("text-medium"), color("text-dark")],
    border: [color("border")],
    bg: [color("bg-light"), color("bg-medium"), color("bg-dark")],
  },
  primaryColor: "brand",
  primaryShade: 2,
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
      outline: `0.125rem solid ${theme.colors.brand[1]}`,
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
    ...getRadioOverrides(),
    ...getTextOverrides(),
    ...getTitleOverrides(),
  },
});
