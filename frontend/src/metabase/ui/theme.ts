import type { MantineThemeOverride } from "@mantine/core";
import { color } from "metabase/lib/colors";
import {
  getAccordionOverrides,
  getAnchorOverrides,
  getCheckboxOverrides,
  getMenuOverrides,
  getRadioOverrides,
  getTextOverrides,
} from "./components";

export const getThemeOverrides = (): MantineThemeOverride => ({
  colors: {
    brand: [color("brand-light"), color("brand")],
    text: [color("text-light"), color("text-medium"), color("text-dark")],
    border: [color("border")],
    bg: [color("bg-light"), color("bg-medium"), color("bg-dark")],
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
  },
  fontSizes: {
    xs: "11px",
    sm: "12px",
    md: "14px",
    lg: "17px",
    xl: "21px",
  },
  fontFamily: 'Lato, "Helvetica Neue", Helvetica, sans-serif',
  fontFamilyMonospace: "Monaco, monospace",
  components: {
    ...getAccordionOverrides(),
    ...getAnchorOverrides(),
    ...getCheckboxOverrides(),
    ...getMenuOverrides(),
    ...getRadioOverrides(),
    ...getTextOverrides(),
  },
});
