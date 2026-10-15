import { Button, type ButtonProps as MantineButtonProps } from "@mantine/core";

import { color } from "metabase/ui/utils/colors";

import ButtonStyles from "./Button.module.css";
import type { ButtonColor, ButtonVariant } from "./types";

const BUTTON_VARIANTS = [
  "default",
  "filled",
  "light",
  "subtle",
  "transparent",
  "on-dark-primary",
  "on-dark-secondary",
] as const satisfies readonly ButtonVariant[];

const BUTTON_COLORS = [
  "brand",
  "filter",
  "negative",
  "positive",
  "warning",
  "neutral",
] as const satisfies readonly ButtonColor[];

const DEFAULT_COLORS: Partial<Record<ButtonVariant, ButtonColor>> = {
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
] as const satisfies readonly `${ButtonVariant}-${ButtonColor}`[];

const DEFAULT_LABEL_HOVER_CELLS = [
  "default-neutral",
  "filled-brand",
  "filled-filter",
  "filled-negative",
  "filled-positive",
  "filled-warning",
  "light-neutral",
  "subtle-neutral",
] as const satisfies readonly Cell[];

type Cell = (typeof CELLS)[number];
type DefaultLabelHoverCell = (typeof DEFAULT_LABEL_HOVER_CELLS)[number];

const isButtonVariant = (value: unknown): value is ButtonVariant =>
  BUTTON_VARIANTS.some((item) => item === value);

const isButtonColor = (value: unknown): value is ButtonColor =>
  BUTTON_COLORS.some((item) => item === value);

const isCell = (value: string): value is Cell =>
  CELLS.some((item) => item === value);

const isDefaultLabelHoverCell = (value: Cell): value is DefaultLabelHoverCell =>
  DEFAULT_LABEL_HOVER_CELLS.some((item) => item === value);

const getCell = (
  variant: ButtonVariant,
  buttonColor: MantineButtonProps["color"],
): Cell | undefined => {
  const defaultColor = DEFAULT_COLORS[variant];
  const cellVariant = variant === "transparent" ? "subtle" : variant;
  const cellColor = isButtonColor(buttonColor) ? buttonColor : defaultColor;
  const cell = `${cellVariant}-${cellColor}`;
  if (isCell(cell)) {
    return cell;
  }
  const defaultCell = `${cellVariant}-${defaultColor}`;
  return isCell(defaultCell) ? defaultCell : undefined;
};

const getRootVars = ({
  variant,
  color: buttonColor,
}: MantineButtonProps): Record<string, string> => {
  const cell = isButtonVariant(variant)
    ? getCell(variant, buttonColor)
    : undefined;
  if (!cell) {
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
