import { Button, type ButtonProps } from "@mantine/core";

import { color } from "metabase/ui/utils/colors";

import ButtonStyles from "./Button.module.css";

const BUTTON_COLORS = [
  "brand",
  "filter",
  "negative",
  "positive",
  "warning",
  "neutral",
] as const;

type ButtonColor = (typeof BUTTON_COLORS)[number];

const DEFAULT_COLORS: Record<string, ButtonColor> = {
  default: "neutral",
  filled: "brand",
  light: "brand",
  subtle: "brand",
  transparent: "brand",
};

const CELLS = [
  "default-neutral",
  "filled-brand",
  "filled-filter",
  "filled-negative",
  "filled-positive",
  "filled-warning",
  "light-brand",
  "light-filter",
  "light-negative",
  "light-neutral",
  "light-positive",
  "subtle-brand",
  "subtle-negative",
  "subtle-neutral",
  "subtle-positive",
] as const;

const DEFAULT_LABEL_HOVER_CELLS = [
  "default-neutral",
  "filled-brand",
  "filled-filter",
  "filled-negative",
  "filled-positive",
  "filled-warning",
  "light-neutral",
  "subtle-neutral",
] as const;

type Cell = (typeof CELLS)[number];
type DefaultLabelHoverCell = (typeof DEFAULT_LABEL_HOVER_CELLS)[number];

const isButtonColor = (value: unknown): value is ButtonColor =>
  BUTTON_COLORS.some((item) => item === value);

const isCell = (value: string): value is Cell =>
  CELLS.some((item) => item === value);

const isDefaultLabelHoverCell = (value: Cell): value is DefaultLabelHoverCell =>
  DEFAULT_LABEL_HOVER_CELLS.some((item) => item === value);

const getRootVars = ({
  variant,
  color: buttonColor,
}: ButtonProps): Record<string, string> => {
  if (!variant) {
    return {};
  }
  const tokenColor = isButtonColor(buttonColor)
    ? buttonColor
    : DEFAULT_COLORS[variant];
  variant = variant === "transparent" ? "subtle" : variant;
  const cell = `${variant}-${tokenColor}`;
  if (!isCell(cell)) {
    return {};
  }
  return {
    "--button-color": color(`button_label-${cell}-default`),
    "--button-hover-color": isDefaultLabelHoverCell(cell)
      ? color(`button_label-${cell}-default`)
      : color(`button_label-${cell}-hover`),
    "--button-bg": color(`button-${cell}-default`),
    "--button-hover": color(`button-${cell}-hover`),
    "--button-pressed": color(`button-${cell}-pressed`),
  };
};

export const buttonOverrides = {
  Button: Button.extend({
    defaultProps: {
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
      loader: ButtonStyles.loader,
    },
  }),
};
