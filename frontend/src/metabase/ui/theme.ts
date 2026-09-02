import type { MantineThemeOverride } from "@mantine/core";
import { rem } from "@mantine/core";

import type { ColorSettings } from "metabase-types/api";

import Styles from "./Theme.module.css";
import { DEFAULT_METABASE_COMPONENT_THEME } from "./component-theme";
import {
  accordionOverrides,
  actionIconOverrides,
  alertOverrides,
  anchorOverrides,
  autocompleteOverrides,
  avatarOverrides,
  badgeOverrides,
  breadcrumbsOverrides,
  buttonOverrides,
  calendarOverrides,
  cardOverrides,
  checkboxOverrides,
  chipOverrides,
  codeOverrides,
  comboboxOverrides,
  dateInputOverrides,
  datePickerOverrides,
  dateTimePickerOverrides,
  dialogOverrides,
  dividerOverrides,
  drawerOverrides,
  fileInputOverrides,
  gridOverrides,
  groupOverrides,
  hoverCardOverrides,
  inputOverrides,
  kbdOverrides,
  listOverrides,
  loaderOverrides,
  menuOverrides,
  modalOverrides,
  monthPickerOverrides,
  multiSelectOverrides,
  nativeSelectOverrides,
  navLinkOverrides,
  notificationOverrides,
  numberInputOverrides,
  overlayOverrides,
  paperOverrides,
  passwordInputOverrides,
  pillOverrides,
  pillsInputOverrides,
  popoverOverrides,
  portalOverrides,
  progressOverrides,
  radioOverrides,
  ringProgressOverrides,
  scrollAreaOverrides,
  segmentedControlOverrides,
  selectOverrides,
  simpleGridOverrides,
  skeletonOverrides,
  sliderOverrides,
  stackOverrides,
  switchOverrides,
  tabsOverrides,
  textInputOverrides,
  textOverrides,
  textareaOverrides,
  timeInputOverrides,
  timelineOverrides,
  titleOverrides,
  tooltipOverrides,
} from "./components";
import { getMantineThemeColors } from "./utils/colors";

// Elevation tokens from the design system.
/* eslint-disable metabase/no-color-literals */
const LIGHT_SHADOWS = {
  xs: "0 1px 3px 0 rgba(0, 0, 0, 0.07)",
  xs_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.07), 0 1px 3px 0 rgba(0, 0, 0, 0.07)",
  sm: "0 1px 4px 0 rgba(0, 0, 0, 0.05), 0 5px 15px 0 rgba(0, 0, 0, 0.10)",
  sm_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.07), 0 1px 4px 0 rgba(0, 0, 0, 0.05), 0 5px 15px 0 rgba(0, 0, 0, 0.10)",
  lg_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.07), 0 5px 15px 0 rgba(0, 0, 0, 0.15), 0 30px 60px 0 rgba(0, 0, 0, 0.20)",
};

const DARK_SHADOWS = {
  xs: "0 1px 3px 0 rgba(0, 0, 0, 0.20)",
  xs_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.15), 0 1px 3px 0 rgba(0, 0, 0, 0.20)",
  sm: "0 1px 4px 0 rgba(0, 0, 0, 0.07), 0 5px 15px 0 rgba(0, 0, 0, 0.20)",
  sm_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.15), 0 1px 4px 0 rgba(0, 0, 0, 0.07), 0 5px 15px 0 rgba(0, 0, 0, 0.20)",
  lg_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.15), 0 5px 15px 0 rgba(0, 0, 0, 0.20), 0 30px 60px 0 rgba(0, 0, 0, 0.40)",
};
/* eslint-enable metabase/no-color-literals */

export type ShadowScaleKey = keyof typeof LIGHT_SHADOWS;

// Spacing tokens from the design system.
const SPACING_SCALE = {
  xxxs: rem(2),
  xxs: rem(4),
  xs: rem(6),
  sm: rem(8),
  md: rem(12),
  lg: rem(16),
  xl: rem(24),
  xxl: rem(32),
  xxxl: rem(40),
};

export type SpacingScaleKey = keyof typeof SPACING_SCALE;

// Radius tokens from the design system.
const RADIUS_SCALE = {
  xxxs: rem(2),
  xxs: rem(4),
  xs: rem(6),
  sm: rem(8),
  md: rem(12),
  lg: rem(16),
  xl: rem(24),
};

export type RadiusScaleKey = keyof typeof RADIUS_SCALE;

export const breakpoints = {
  xs: "23em",
  sm: "40em",
  md: "60em",
  lg: "80em",
  xl: "120em",
};
export type BreakpointName = keyof typeof breakpoints;

export const getThemeOverrides = (
  colorScheme: "light" | "dark" = "light",
  whitelabelColors?: ColorSettings | null,
): MantineThemeOverride => ({
  focusClassName: Styles.focus,
  breakpoints,
  colors: getMantineThemeColors(colorScheme, whitelabelColors),
  primaryColor: "core-brand",
  primaryShade: 0,
  // Store colorScheme in other property for access later
  other: {
    ...DEFAULT_METABASE_COMPONENT_THEME,
    colorScheme,
  },
  shadows: {
    ...(colorScheme === "dark" ? DARK_SHADOWS : LIGHT_SHADOWS),
  },
  spacing: { ...SPACING_SCALE },
  radius: { ...RADIUS_SCALE },
  defaultRadius: "xs",
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
        fontSize: rem(32),
        lineHeight: rem(38),
      },
      h2: {
        fontSize: rem(24),
        lineHeight: rem(28),
      },
      h3: {
        fontSize: rem(20),
        lineHeight: rem(24),
      },
      h4: {
        fontSize: rem(17),
        lineHeight: rem(20),
      },
      h5: {
        fontSize: rem(14),
        lineHeight: rem(16),
      },
      h6: {
        fontSize: rem(14),
        lineHeight: rem(16),
      },
    },
  },
  fontFamily: "var(--mb-default-font-family)",
  fontFamilyMonospace: "Monaco, monospace",
  components: {
    ...accordionOverrides,
    ...actionIconOverrides,
    ...alertOverrides,
    ...anchorOverrides,
    ...autocompleteOverrides,
    ...avatarOverrides,
    ...badgeOverrides,
    ...breadcrumbsOverrides,
    ...buttonOverrides,
    ...calendarOverrides,
    ...cardOverrides,
    ...checkboxOverrides,
    ...chipOverrides,
    ...comboboxOverrides,
    ...codeOverrides,
    ...dateInputOverrides,
    ...datePickerOverrides,
    ...dateTimePickerOverrides,
    ...dialogOverrides,
    ...dividerOverrides,
    ...drawerOverrides,
    ...fileInputOverrides,
    ...gridOverrides,
    ...groupOverrides,
    ...inputOverrides,
    ...kbdOverrides,
    ...loaderOverrides,
    ...menuOverrides,
    ...modalOverrides,
    ...monthPickerOverrides,
    ...multiSelectOverrides,
    ...nativeSelectOverrides,
    ...navLinkOverrides,
    ...notificationOverrides,
    ...numberInputOverrides,
    ...radioOverrides,
    ...overlayOverrides,
    ...paperOverrides,
    ...passwordInputOverrides,
    ...pillOverrides,
    ...pillsInputOverrides,
    ...popoverOverrides,
    ...portalOverrides,
    ...progressOverrides,
    ...ringProgressOverrides,
    ...scrollAreaOverrides,
    ...segmentedControlOverrides,
    ...simpleGridOverrides,
    ...skeletonOverrides,
    ...stackOverrides,
    ...selectOverrides,
    ...sliderOverrides,
    ...switchOverrides,
    ...tabsOverrides,
    ...textareaOverrides,
    ...textInputOverrides,
    ...textOverrides,
    ...timeInputOverrides,
    ...timelineOverrides,
    ...titleOverrides,
    ...tooltipOverrides,
    ...hoverCardOverrides,
    ...listOverrides,
  },
});
