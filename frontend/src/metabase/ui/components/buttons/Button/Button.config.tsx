import { Button, type ButtonProps } from "@mantine/core";

import ButtonStyles from "./Button.module.css";

type ButtonRootVars = Record<string, string>;

const DEFAULT_VARS: ButtonRootVars = {
  "--button-color": "var(--mb-color-button_label-default-neutral-default)",
  "--button-hover-color":
    "var(--mb-color-button_label-default-neutral-default)",
  "--button-bg": "var(--mb-color-button-default-neutral-default)",
  "--button-hover": "var(--mb-color-button-default-neutral-hover)",
  "--button-pressed": "var(--mb-color-button-default-neutral-pressed)",
  "--button-bd": "0.5px solid var(--mb-color-border-neutral-strong)",
};

const COLOR_FAMILIES: Record<string, string> = {
  "core-brand": "brand",
  "feedback-negative": "negative",
  "text-primary": "neutral",
};

const TOKENIZED_FAMILIES: Record<string, string[]> = {
  filled: ["brand", "negative"],
  light: ["brand", "negative", "neutral"],
  subtle: ["brand", "negative", "neutral"],
  transparent: ["brand", "negative", "neutral"],
};

const getFamilyVars = (variant: string, family: string): ButtonRootVars => {
  const tokenVariant = variant === "transparent" ? "subtle" : variant;
  const labelHover =
    family === "neutral" || variant === "filled" ? "default" : "hover";
  return {
    "--button-color": `var(--mb-color-button_label-${tokenVariant}-${family}-default)`,
    "--button-hover-color": `var(--mb-color-button_label-${tokenVariant}-${family}-${labelHover})`,
    "--button-bg": `var(--mb-color-button-${tokenVariant}-${family}-default)`,
    "--button-hover": `var(--mb-color-button-${tokenVariant}-${family}-hover)`,
    "--button-pressed": `var(--mb-color-button-${tokenVariant}-${family}-pressed)`,
  };
};

const TRANSPARENT_VARS: ButtonRootVars = {
  "--button-hover": "transparent",
  "--button-pressed": "transparent",
};

const ON_DARK_VARS: Record<string, ButtonRootVars> = {
  "on-dark-primary": {
    "--button-color": "var(--mb-color-button-label-on_dark-primary)",
    "--button-hover-color": "var(--mb-color-button-label-on_dark-primary)",
    "--button-bg": "var(--mb-color-button-on_dark-primary-default)",
    "--button-hover": "var(--mb-color-button-on_dark-primary-hover)",
    "--button-pressed": "var(--mb-color-button-on_dark-primary-pressed)",
    "--button-bd": "0.5px solid transparent",
  },
  "on-dark-secondary": {
    "--button-color": "var(--mb-color-button-label-on_dark-secondary)",
    "--button-hover-color": "var(--mb-color-button-label-on_dark-secondary)",
    "--button-bg": "var(--mb-color-button-on_dark-secondary-default)",
    "--button-hover": "var(--mb-color-button-on_dark-secondary-hover)",
    "--button-pressed": "var(--mb-color-button-on_dark-secondary-pressed)",
    "--button-bd": "0.5px solid var(--mb-color-border-on_dark)",
  },
};

const NON_BRAND_VARS: Record<string, ButtonRootVars> = {
  filled: {
    "--button-hover": "color-mix(in srgb, var(--button-bg) 88%, transparent)",
  },
  subtle: {
    "--button-hover": "transparent",
    "--button-hover-color":
      "color-mix(in srgb, var(--button-color) 88%, transparent)",
  },
};

const getRootVars = ({ variant, color, size }: ButtonProps): ButtonRootVars => {
  if (variant === "default") {
    return DEFAULT_VARS;
  }
  if (!variant) {
    return {};
  }
  if (ON_DARK_VARS[variant]) {
    return ON_DARK_VARS[variant];
  }
  const family = COLOR_FAMILIES[color ?? "core-brand"];
  if (family && TOKENIZED_FAMILIES[variant]?.includes(family)) {
    const vars = getFamilyVars(variant, family);
    const isCompact = typeof size === "string" && size.startsWith("compact");
    const isTransparent =
      variant === "transparent" || (variant === "subtle" && isCompact);
    return isTransparent ? { ...vars, ...TRANSPARENT_VARS } : vars;
  }
  return NON_BRAND_VARS[variant] ?? {};
};

export const buttonOverrides = {
  Button: Button.extend({
    defaultProps: {
      color: "core-brand",
      variant: "default",
      size: "md",
      loaderProps: {
        size: "var(--mb-button-loader-size)",
        color: "currentColor",
      },
    },
    vars: (_theme, props) => ({ root: getRootVars(props) }),
    classNames: {
      root: ButtonStyles.root,
      label: ButtonStyles.label,
      inner: ButtonStyles.inner,
      loader: ButtonStyles.loader,
    },
  }),
};
