import type { MantineThemeOverride } from "@mantine/core";
import { rem } from "@mantine/core";

import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/embedding-sdk/theme";

import {
  accordionOverrides,
  actionIconOverrides,
  alertOverrides,
  anchorOverrides,
  autocompleteOverrides,
  badgeOverrides,
  buttonOverrides,
  calendarOverrides,
  cardOverrides,
  checkboxOverrides,
  chipOverrides,
  codeOverrides,
  dateInputOverrides,
  datePickerOverrides,
  dividerOverrides,
  fileInputOverrides,
  hoverCardOverrides,
  inputOverrides,
  listOverrides,
  menuOverrides,
  modalOverrides,
  monthPickerOverrides,
  multiSelectOverrides,
  navLinkOverrides,
  overlayOverrides,
  paperOverrides,
  popoverOverrides,
  progressOverrides,
  radioOverrides,
  scrollAreaOverrides,
  segmentedControlOverrides,
  selectOverrides,
  skeletonOverrides,
  switchOverrides,
  tabsOverrides,
  textInputOverrides,
  textOverrides,
  textareaOverrides,
  timeInputOverrides,
  titleOverrides,
  tooltipOverrides,
} from "./components";
import { getThemeColors } from "./utils/colors";

export const breakpoints = {
  xs: "23em",
  sm: "40em",
  md: "60em",
  lg: "80em",
  xl: "120em",
};
export type BreakpointName = keyof typeof breakpoints;

export const getThemeOverrides = (): MantineThemeOverride => ({
  breakpoints,
  colors: getThemeColors(),
  primaryColor: "brand",
  primaryShade: 0,
  shadows: {
    sm: "0px 1px 4px 2px rgba(0, 0, 0, 0.08)",
    md: "0px 4px 20px 0px rgba(0, 0, 0, 0.05)",
  },
  spacing: {
    xs: rem(4),
    sm: rem(8),
    md: rem(16),
    lg: rem(24),
    xl: rem(32),
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
  lineHeights: {
    xs: "100%",
    sm: "115%",
    md: "122%",
    lg: "138%",
    xl: "150%",
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
  fontFamily: "var(--mb-default-font-family), sans-serif",
  fontFamilyMonospace: "Monaco, monospace",
  components: {
    ...accordionOverrides,
    ...actionIconOverrides,
    ...alertOverrides,
    ...anchorOverrides,
    ...autocompleteOverrides,
    ...badgeOverrides,
    ...buttonOverrides,
    ...calendarOverrides,
    ...cardOverrides,
    ...checkboxOverrides,
    ...chipOverrides,
    ...codeOverrides,
    ...dateInputOverrides,
    ...datePickerOverrides,
    ...dividerOverrides,
    ...fileInputOverrides,
    ...inputOverrides,
    ...menuOverrides,
    ...modalOverrides,
    ...monthPickerOverrides,
    ...multiSelectOverrides,
    ...navLinkOverrides,
    ...radioOverrides,
    ...overlayOverrides,
    ...paperOverrides,
    ...popoverOverrides,
    ...progressOverrides,
    ...scrollAreaOverrides,
    ...segmentedControlOverrides,
    ...skeletonOverrides,
    ...selectOverrides,
    ...switchOverrides,
    ...tabsOverrides,
    ...textareaOverrides,
    ...textInputOverrides,
    ...textOverrides,
    ...timeInputOverrides,
    ...titleOverrides,
    ...tooltipOverrides,
    ...hoverCardOverrides,
    ...listOverrides,
  },
  other: DEFAULT_METABASE_COMPONENT_THEME,
});
