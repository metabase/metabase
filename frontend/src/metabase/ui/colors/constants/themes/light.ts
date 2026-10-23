import type { MetabaseThemeV2 } from "../../types";
import { LIGHT_THEME_ACCENT_COLORS } from "../accent-colors";
import { getBaseColorsForThemeDefinitionOnly } from "../base-colors";

const baseColors = getBaseColorsForThemeDefinitionOnly();

type BrandRamp = typeof baseColors.brand;

/**
 * The default light theme for Metabase.
 */
export const getLightTheme = (
  brand: BrandRamp = baseColors.brand,
): MetabaseThemeV2 => ({
  version: 2,
  chartColors: LIGHT_THEME_ACCENT_COLORS,
  colors: {
    "background_page-filter": baseColors.filter[5],
    "background_page-highlighted":
      "color-mix(in srgb, var(--mb-color-core-brand) 7%, transparent)",
    "background_page-primary": baseColors.white,
    "background_page-primary-inverse": baseColors.orion[95],
    "background_page-secondary": baseColors.orion[5],
    "background_page-secondary-inverse": baseColors.orion[100],
    "background_page-tertiary": baseColors.orion[10],
    "background_page-tertiary-inverse": baseColors.orion[110],
    "background_surface-brand-strong": brand[60],
    "background_surface-brand-strong-hover": brand[70],
    "background_surface-brand-strong-pressed": brand[80],
    "background_surface-brand-subtle":
      "color-mix(in srgb, var(--mb-color-core-brand) 10%, transparent)",
    "background_surface-brand-subtle-hover":
      "color-mix(in srgb, var(--mb-color-core-brand) 30%, transparent)",
    "background_surface-brand-subtle-pressed":
      "color-mix(in srgb, var(--mb-color-core-brand) 60%, transparent)",
    "background_surface-disabled": baseColors.orionAlpha[10],
    "background_surface-disabled-inverse": baseColors.orionAlphaInverse[10],
    "background_surface-error": baseColors.lobster[10],
    "background_surface-error-subtle": baseColors.lobster[5],
    "background_surface-hover":
      "color-mix(in srgb, var(--mb-color-core-brand) 7%, transparent)",
    "background_surface-primary": baseColors.white, // Matches background_page-primary
    "background_surface-primary-hover": baseColors.orionAlpha[10],
    "background_surface-primary-inverse": baseColors.orion[95], // Matches background_page-primary-inverse
    "background_surface-primary-inverse-hover":
      baseColors.orionAlphaInverse[20],
    "background_surface-primary-inverse-pressed":
      baseColors.orionAlphaInverse[10],
    "background_surface-primary-pressed": baseColors.orionAlpha[20],
    "background_surface-secondary": baseColors.orionAlpha[10],
    "background_surface-secondary-hover": baseColors.orionAlpha[20],
    "background_surface-secondary-inverse": baseColors.orionAlphaInverse[10],
    "background_surface-secondary-inverse-hover":
      baseColors.orionAlphaInverse[20],
    "background_surface-secondary-inverse-pressed":
      baseColors.orionAlphaInverse[10],
    "background_surface-secondary-pressed": baseColors.orionAlpha[30],
    "background_surface-selected":
      "color-mix(in srgb, var(--mb-color-core-brand) 21%, transparent)",
    "background_surface-success": baseColors.palm[5],
    "background_surface-warning": baseColors.dubloon[5],
    "background_surface-warning-strong": baseColors.dubloon[20],
    "border-brand": brand[10],
    "border-filter": baseColors.filter[20],
    "border-highlight": brand[60],
    "border-neutral": baseColors.orion[20],
    "border-neutral-inverse-strong": baseColors.orionAlphaInverse[30],
    "border-neutral-strong": baseColors.orionAlpha[30],
    "border-neutral-strongest": baseColors.orionAlpha[50],
    "border-neutral-subtle": baseColors.orionAlpha[10],
    "border-on_dark": baseColors.orionAlphaInverse[20],
    "button-default-neutral-default": baseColors.white, // Matches background_surface-primary
    "button-default-neutral-hover": baseColors.orionAlpha[10], // Matches background_surface-primary-hover
    "button-default-neutral-pressed": baseColors.orionAlpha[20], // Matches background_surface-primary-pressed
    "button-filled-brand-default": brand[60],
    "button-filled-brand-hover": brand[70],
    "button-filled-brand-pressed": brand[80],
    "button-filled-filter-default": baseColors.filter[60],
    "button-filled-filter-hover": baseColors.filter[70],
    "button-filled-filter-pressed": baseColors.filter[80],
    "button-filled-negative-default": baseColors.lobster[60],
    "button-filled-negative-hover": baseColors.lobster[70],
    "button-filled-negative-pressed": baseColors.lobster[80],
    "button-filled-positive-default": baseColors.palm[60],
    "button-filled-positive-hover": baseColors.palm[70],
    "button-filled-positive-pressed": baseColors.palm[80],
    "button-filled-warning-default": baseColors.dubloon[20],
    "button-filled-warning-hover": baseColors.dubloon[30],
    "button-filled-warning-pressed": baseColors.dubloon[40],
    "button-light-brand-default":
      "color-mix(in srgb, var(--mb-color-core-brand) 7%, transparent)",
    "button-light-brand-hover":
      "color-mix(in srgb, var(--mb-color-core-brand) 21%, transparent)",
    "button-light-brand-pressed":
      "color-mix(in srgb, var(--mb-color-core-brand) 45%, transparent)",
    "button-light-filter-default":
      "color-mix(in srgb, var(--mb-color-core-filter) 15%, transparent)",
    "button-light-filter-hover":
      "color-mix(in srgb, var(--mb-color-core-filter) 30%, transparent)",
    "button-light-filter-pressed":
      "color-mix(in srgb, var(--mb-color-core-filter) 60%, transparent)",
    "button-light-negative-default": baseColors.lobsterAlpha[10],
    "button-light-negative-hover": baseColors.lobsterAlpha[20],
    "button-light-negative-pressed": baseColors.lobsterAlpha[30],
    "button-light-neutral-default": baseColors.orionAlpha[10], // Matches background_surface-secondary
    "button-light-neutral-hover": baseColors.orionAlpha[20], // Matches background_surface-secondary-hover
    "button-light-neutral-pressed": baseColors.orionAlpha[30], // Matches background_surface-secondary-pressed
    "button-light-positive-default": baseColors.palmAlpha[10],
    "button-light-positive-hover": baseColors.palmAlpha[20],
    "button-light-positive-pressed": baseColors.palmAlpha[30],
    "button-on_dark-disabled": baseColors.orionAlphaInverse[10],
    "button-on_dark_primary-negative-default": baseColors.lobster[20],
    "button-on_dark_primary-negative-hover": baseColors.lobster[10],
    "button-on_dark_primary-negative-pressed": baseColors.lobster[20],
    "button-on_dark_primary-neutral-default": baseColors.white,
    "button-on_dark_primary-neutral-hover": baseColors.orion[20],
    "button-on_dark_primary-neutral-pressed": baseColors.orion[30],
    "button-on_dark_secondary-negative-default": baseColors.blackAlpha[10],
    "button-on_dark_secondary-negative-hover": baseColors.orionAlphaInverse[10],
    "button-on_dark_secondary-negative-pressed": baseColors.blackAlpha[10],
    "button-on_dark_secondary-neutral-default":
      baseColors.orionAlphaInverse[10],
    "button-on_dark_secondary-neutral-hover": baseColors.orionAlphaInverse[20],
    "button-on_dark_secondary-neutral-pressed":
      baseColors.orionAlphaInverse[10],
    "button-subtle-brand-default": baseColors.transparent,
    "button-subtle-brand-hover":
      "color-mix(in srgb, var(--mb-color-core-brand) 21%, transparent)",
    "button-subtle-brand-pressed":
      "color-mix(in srgb, var(--mb-color-core-brand) 45%, transparent)",
    "button-subtle-negative-default": baseColors.transparent,
    "button-subtle-negative-hover": baseColors.lobsterAlpha[20],
    "button-subtle-negative-pressed": baseColors.lobsterAlpha[30],
    "button-subtle-neutral-default": baseColors.transparent,
    "button-subtle-neutral-hover": baseColors.orionAlpha[10], // Matches background_surface-primary-hover
    "button-subtle-neutral-pressed": baseColors.orionAlpha[20], // Matches background_surface-primary-pressed
    "button-subtle-positive-default": baseColors.transparent,
    "button-subtle-positive-hover": baseColors.palmAlpha[20],
    "button-subtle-positive-pressed": baseColors.palmAlpha[30],
    "button-subtle-warning-default": baseColors.transparent,
    "button-subtle-warning-hover": baseColors.dubloonAlpha[30],
    "button-subtle-warning-pressed": baseColors.dubloonAlpha[40],
    "button_label-default-neutral-default": baseColors.orionAlpha[80], // Matches text-primary
    "button_label-filled-brand-default": baseColors.white,
    "button_label-filled-filter-default": baseColors.white,
    "button_label-filled-negative-default": baseColors.white,
    "button_label-filled-positive-default": baseColors.white,
    "button_label-filled-warning-default": baseColors.lobster[80],
    "button_label-light-brand-default": brand[60],
    "button_label-light-brand-hover": brand[70],
    "button_label-light-filter-default": baseColors.filter[70],
    "button_label-light-filter-hover": baseColors.filter[80],
    "button_label-light-negative-default": baseColors.lobster[70],
    "button_label-light-negative-hover": baseColors.lobster[80],
    "button_label-light-neutral-default": baseColors.orionAlpha[80], // Matches text-primary
    "button_label-light-positive-default": baseColors.palm[70],
    "button_label-light-positive-hover": baseColors.palm[80],
    "button_label-on_dark-disabled": baseColors.orionAlphaInverse[40],
    "button_label-on_dark_primary-negative-default": baseColors.lobster[70],
    "button_label-on_dark_primary-neutral-default": baseColors.orionAlpha[80],
    "button_label-on_dark_secondary-negative-default": baseColors.lobster[30],
    "button_label-on_dark_secondary-neutral-default": baseColors.white,
    "button_label-subtle-brand-default": brand[60],
    "button_label-subtle-brand-hover": brand[70],
    "button_label-subtle-negative-default": baseColors.lobster[70],
    "button_label-subtle-negative-hover": baseColors.lobster[80],
    "button_label-subtle-neutral-default": baseColors.orionAlpha[80], // Matches text-primary
    "button_label-subtle-positive-default": baseColors.palm[70],
    "button_label-subtle-positive-hover": baseColors.palm[80],
    "button_label-subtle-warning-default": baseColors.mango[70],
    "button_label-subtle-warning-hover": baseColors.mango[80],
    "chart-axis": baseColors.orionAlpha[20],
    "core-blue-saturated": baseColors.ocean[60],
    "core-brand": baseColors.blue[40],
    "core-brand-hover": brand[50],
    "core-filter": baseColors.octopus[50],
    "core-filter-strong": baseColors.filter[50],
    "core-gold": baseColors.gold,
    "core-green-saturated": baseColors.palm[60],
    "core-info": baseColors.orion[40],
    "core-metabase_brand": baseColors.blue[40],
    "core-metabase_brand-hover": baseColors.blue[30],
    "core-purple-saturated": baseColors.octopus[60],
    "core-red-saturated": baseColors.lobster[60],
    "core-summarize": baseColors.palm[50],
    "core-white": baseColors.white,
    "core-white_constant": baseColors.white,
    "core-yellow-saturated": baseColors.dubloon[30],
    "feedback-negative": baseColors.lobster[50],
    "feedback-negative-strong": baseColors.lobster[60],
    "feedback-neutral-strong": baseColors.orionAlpha[60],
    "feedback-positive": baseColors.palm[50],
    "feedback-positive-selected": baseColors.palm[60],
    "feedback-positive-strong": baseColors.palm[60],
    "feedback-warning": baseColors.dubloon[30],
    "feedback-warning-strong": baseColors.mango[60],
    "icon-brand": brand[50], // Matches text-brand
    "icon-brand-inverse": brand[20],
    "icon-disabled": baseColors.orionAlpha[40], // Matches text-disabled
    "icon-disabled-inverse": baseColors.orionAlphaInverse[40], // Matches text-disabled-inverse
    "icon-primary": baseColors.orionAlpha[80], // Matches text-primary
    "icon-primary-inverse": baseColors.orionAlphaInverse[80], // Matches text-primary-inverse
    "icon-secondary": baseColors.orionAlpha[60], // Matches text-secondary
    "icon-secondary-inverse": baseColors.orionAlphaInverse[60], // Matches text-secondary-inverse
    "illustration-secondary-brand": brand[10],
    "illustration-tertiary-brand": brand[5],
    "input-background": baseColors.orionAlpha[5],
    "input-focus": baseColors.blue[20],
    "modal-border": baseColors.transparent,
    "modal-overlay": baseColors.blackAlpha[10],
    "navbar-admin": baseColors.octopus[60],
    "navbar-admin-inverse": baseColors.octopus[80],
    "navbar-admin-secondary": baseColors.octopus[40],
    "segmented_control-hover": baseColors.orionAlpha[10],
    "segmented_control-pressed": baseColors.orionAlpha[20],
    "segmented_control-selected": baseColors.white,
    "shadow-default": baseColors.orionAlpha[20],
    "switch-checked": brand[60],
    "switch-disabled": baseColors.orionAlpha[20],
    "switch-unchecked": baseColors.orionAlpha[30],
    "switch_thumb-disabled": baseColors.white,
    "text-brand": brand[50],
    "text-brand-hover": brand[60],
    "text-brand-strong": brand[60],
    "text-brand-strong-hover": brand[70],
    "text-disabled": baseColors.orionAlpha[40],
    "text-disabled-inverse": baseColors.orionAlphaInverse[40],
    "text-filter": baseColors.filter[50],
    "text-primary": baseColors.orionAlpha[80],
    "text-primary-inverse": baseColors.orionAlphaInverse[80],
    "text-secondary": baseColors.orionAlpha[60],
    "text-secondary-inverse": baseColors.orionAlphaInverse[60],
    "text-secondary-opaque": baseColors.orion[60],
    "text-selected": baseColors.orionAlpha[80],
    "text-syntax-parameter": baseColors.mango[60],
    "text-syntax-parameter-active": baseColors.mango[10],
    "tooltip-background": baseColors.orion[80],
    "tooltip-background-focused": baseColors.orion[90],
    "tooltip-text": baseColors.white,
    "tooltip-text-secondary": baseColors.orionAlphaInverse[60],
  },
});
