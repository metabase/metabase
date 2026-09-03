import { Button, type ButtonProps } from "@mantine/core";

import ButtonStyles from "./Button.module.css";

type ButtonRootVars = Record<string, string>;

const DEFAULT_VARS: ButtonRootVars = {
  "--button-color": "var(--mb-color-text-primary)",
  "--button-hover-color": "var(--mb-color-text-primary)",
  "--button-bg": "var(--mb-color-background_surface-primary)",
  "--button-hover": "var(--mb-color-background_surface-primary-hover)",
  "--button-pressed": "var(--mb-color-background_surface-primary-pressed)",
  "--button-bd": "0.5px solid var(--mb-color-border-neutral-strong)",
};

const BRAND_VARS: Record<string, ButtonRootVars> = {
  filled: {
    "--button-color": "var(--mb-color-text-primary-inverse)",
    "--button-hover-color": "var(--mb-color-text-primary-inverse)",
    "--button-bg": "var(--mb-color-background_surface-brand-strong)",
    "--button-hover": "var(--mb-color-background_surface-brand-strong-hover)",
    "--button-pressed":
      "var(--mb-color-background_surface-brand-strong-pressed)",
  },
  light: {
    "--button-color": "var(--mb-color-text-brand-strong)",
    "--button-hover-color": "var(--mb-color-text-brand-strong-hover)",
    "--button-bg": "var(--mb-color-background_surface-brand-subtle)",
    "--button-hover": "var(--mb-color-background_surface-brand-subtle-hover)",
    "--button-pressed":
      "var(--mb-color-background_surface-brand-subtle-pressed)",
  },
  subtle: {
    "--button-color": "var(--mb-color-text-brand-strong)",
    "--button-hover-color": "var(--mb-color-text-brand-strong-hover)",
    "--button-bg": "transparent",
    "--button-hover": "var(--mb-color-background_surface-brand-subtle-hover)",
    "--button-pressed":
      "var(--mb-color-background_surface-brand-subtle-pressed)",
  },
};

const NEUTRAL_VARS: Record<string, ButtonRootVars> = {
  light: {
    "--button-color": "var(--mb-color-text-primary)",
    "--button-hover-color": "var(--mb-color-text-primary)",
    "--button-bg": "var(--mb-color-background_surface-secondary)",
    "--button-hover": "var(--mb-color-background_surface-secondary-hover)",
    "--button-pressed": "var(--mb-color-background_surface-secondary-pressed)",
  },
  subtle: {
    "--button-color": "var(--mb-color-text-primary)",
    "--button-hover-color": "var(--mb-color-text-primary)",
    "--button-bg": "transparent",
    "--button-hover": "var(--mb-color-background_surface-primary-hover)",
    "--button-pressed": "var(--mb-color-background_surface-primary-pressed)",
  },
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

const getRootVars = ({ variant, color }: ButtonProps): ButtonRootVars => {
  if (variant === "default") {
    return DEFAULT_VARS;
  }
  if (!variant) {
    return {};
  }
  if (ON_DARK_VARS[variant]) {
    return ON_DARK_VARS[variant];
  }
  if (!color || color === "core-brand") {
    return BRAND_VARS[variant] ?? {};
  }
  if (color === "text-primary" && NEUTRAL_VARS[variant]) {
    return NEUTRAL_VARS[variant];
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
        size: "1rem",
        color: "currentColor",
      },
    },
    vars: (_theme, props) => ({ root: getRootVars(props) }),
    classNames: {
      root: ButtonStyles.root,
      label: ButtonStyles.label,
      inner: ButtonStyles.inner,
    },
  }),
};
