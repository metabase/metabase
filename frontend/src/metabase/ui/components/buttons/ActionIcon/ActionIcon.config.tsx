import {
  ActionIcon,
  type ActionIconProps as MantineActionIconProps,
} from "@mantine/core";

import { color } from "metabase/ui/utils/colors";

import ActionIconStyles from "./ActionIcon.module.css";
import type { ActionIconColor, ActionIconVariant } from "./types";

const ACTION_ICON_VARIANTS = [
  "default",
  "filled",
  "light",
  "subtle",
  "on-dark-primary",
  "on-dark-secondary",
] as const satisfies readonly ActionIconVariant[];

const ACTION_ICON_COLORS = [
  "brand",
  "negative",
  "positive",
  "warning",
  "neutral",
] as const satisfies readonly ActionIconColor[];

const CELL_VARIANTS = {
  default: "default",
  filled: "filled",
  light: "light",
  subtle: "subtle",
  "on-dark-primary": "on_dark_primary",
  "on-dark-secondary": "on_dark_secondary",
} as const satisfies Record<ActionIconVariant, string>;

const DEFAULT_COLORS: Partial<Record<ActionIconVariant, ActionIconColor>> = {
  default: "neutral",
  filled: "brand",
  light: "neutral",
  subtle: "neutral",
  "on-dark-primary": "neutral",
  "on-dark-secondary": "neutral",
};

const CELLS = [
  "default-neutral",
  "filled-brand",
  "light-neutral",
  "on_dark_primary-neutral",
  "on_dark_secondary-neutral",
  "subtle-brand",
  "subtle-negative",
  "subtle-neutral",
  "subtle-positive",
  "subtle-warning",
] as const satisfies readonly `${CellVariant}-${ActionIconColor}`[];

const DEFAULT_LABEL_HOVER_CELLS = [
  "default-neutral",
  "filled-brand",
  "light-neutral",
  "on_dark_primary-neutral",
  "on_dark_secondary-neutral",
  "subtle-neutral",
] as const satisfies readonly Cell[];

type CellVariant = (typeof CELL_VARIANTS)[ActionIconVariant];
type Cell = (typeof CELLS)[number];
type DefaultLabelHoverCell = (typeof DEFAULT_LABEL_HOVER_CELLS)[number];

const isActionIconVariant = (value: unknown): value is ActionIconVariant =>
  ACTION_ICON_VARIANTS.some((item) => item === value);

const isActionIconColor = (value: unknown): value is ActionIconColor =>
  ACTION_ICON_COLORS.some((item) => item === value);

const isCell = (value: string): value is Cell =>
  CELLS.some((item) => item === value);

const isDefaultLabelHoverCell = (value: Cell): value is DefaultLabelHoverCell =>
  DEFAULT_LABEL_HOVER_CELLS.some((item) => item === value);

const getCell = (
  variant: ActionIconVariant,
  iconColor: MantineActionIconProps["color"],
): Cell | undefined => {
  const defaultColor = DEFAULT_COLORS[variant];
  const cellVariant = CELL_VARIANTS[variant];
  const cellColor = isActionIconColor(iconColor) ? iconColor : defaultColor;
  const cell = `${cellVariant}-${cellColor}`;
  if (isCell(cell)) {
    return cell;
  }
  const defaultCell = `${cellVariant}-${defaultColor}`;
  return isCell(defaultCell) ? defaultCell : undefined;
};

const getRootVars = ({
  variant,
  color: iconColor,
}: MantineActionIconProps): Record<string, string> => {
  const cell = isActionIconVariant(variant)
    ? getCell(variant, iconColor)
    : undefined;
  if (!cell) {
    return {};
  }
  return {
    "--ai-color": color(`button_label-${cell}-default`),
    "--ai-hover-color": isDefaultLabelHoverCell(cell)
      ? color(`button_label-${cell}-default`)
      : color(`button_label-${cell}-hover`),
    "--ai-bg": color(`button-${cell}-default`),
    "--ai-hover": color(`button-${cell}-hover`),
    "--ai-pressed": color(`button-${cell}-pressed`),
  };
};

export const actionIconOverrides = {
  ActionIcon: ActionIcon.extend({
    defaultProps: {
      variant: "default",
      size: "md",
      loaderProps: {
        color: "currentColor",
      },
    },
    vars: (_theme, props) => ({ root: getRootVars(props) }),
    classNames: {
      root: ActionIconStyles.root,
      icon: ActionIconStyles.icon,
    },
  }),
};
