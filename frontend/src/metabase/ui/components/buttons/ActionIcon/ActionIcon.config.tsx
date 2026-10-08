import {
  ActionIcon,
  type ActionIconProps,
  type MantineThemeOverride,
} from "@mantine/core";

import { color } from "metabase/ui/utils/colors";

import ActionIconStyles from "./ActionIcon.module.css";
import type { ActionIconColor } from "./types";

const ACTION_ICON_VARIANTS = ["default", "light", "subtle"] as const;

const ACTION_ICON_COLORS = [
  "neutral",
  "brand",
  "negative",
  "positive",
  "warning",
] as const satisfies readonly ActionIconColor[];

type ActionIconVariant = (typeof ACTION_ICON_VARIANTS)[number];

const CELLS = [
  "default-neutral",
  "light-neutral",
  "subtle-neutral",
  "subtle-brand",
  "subtle-negative",
  "subtle-positive",
  "subtle-warning",
] as const satisfies readonly `${ActionIconVariant}-${ActionIconColor}`[];

const NEUTRAL_CELLS = [
  "default-neutral",
  "light-neutral",
  "subtle-neutral",
] as const satisfies readonly Cell[];

type Cell = (typeof CELLS)[number];
type NeutralCell = (typeof NEUTRAL_CELLS)[number];

const isActionIconVariant = (value: unknown): value is ActionIconVariant =>
  ACTION_ICON_VARIANTS.some((item) => item === value);

const isActionIconColor = (value: unknown): value is ActionIconColor =>
  ACTION_ICON_COLORS.some((item) => item === value);

const isCell = (value: string): value is Cell =>
  CELLS.some((item) => item === value);

const isNeutralCell = (value: Cell): value is NeutralCell =>
  NEUTRAL_CELLS.some((item) => item === value);

const getCell = (
  variant: ActionIconVariant,
  iconColor: ActionIconProps["color"],
): Cell => {
  const cell = `${variant}-${isActionIconColor(iconColor) ? iconColor : "neutral"}`;
  return isCell(cell) ? cell : `${variant}-neutral`;
};

const getLabelVars = (cell: Cell): Record<string, string> =>
  isNeutralCell(cell)
    ? {
        "--mb-ai-color": color("icon-primary"),
        "--mb-ai-hover-color": color("icon-primary"),
      }
    : {
        "--mb-ai-color": color(`button_label-${cell}-default`),
        "--mb-ai-hover-color": color(`button_label-${cell}-hover`),
      };

const getRootVars = ({
  variant,
  color: iconColor,
}: ActionIconProps): Record<string, string> => {
  if (!isActionIconVariant(variant)) {
    return {};
  }
  const cell = getCell(variant, iconColor);
  return {
    ...getLabelVars(cell),
    "--mb-ai-bg": color(`button-${cell}-default`),
    "--mb-ai-hover": color(`button-${cell}-hover`),
    "--mb-ai-pressed": color(`button-${cell}-pressed`),
  };
};

export const actionIconOverrides: MantineThemeOverride["components"] = {
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
