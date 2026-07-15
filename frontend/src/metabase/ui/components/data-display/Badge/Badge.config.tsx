import { Badge } from "@mantine/core";

import type { ColorName } from "metabase/ui/colors/types";
import { color } from "metabase/ui/utils/colors";

import BadgeStyles from "./Badge.module.css";

const BADGE_COLORS = [
  "neutral",
  "brand",
  "negative",
  "warning",
  "positive",
] as const;

type BadgeColor = (typeof BADGE_COLORS)[number];

const FILLED_BG: Record<BadgeColor, ColorName> = {
  neutral: "feedback-neutral-strong",
  brand: "background_surface-brand-strong",
  negative: "feedback-negative-strong",
  warning: "feedback-warning-strong",
  positive: "feedback-positive-strong",
};

const FILLED_TEXT: Record<BadgeColor, ColorName> = {
  neutral: "core-white_constant",
  brand: "text-primary-inverse",
  negative: "text-primary-inverse",
  warning: "text-primary-inverse",
  positive: "text-primary-inverse",
};

const ACCENT_TEXT: Record<BadgeColor, ColorName> = {
  neutral: "text-primary",
  brand: "text-brand-strong",
  negative: "feedback-negative-strong",
  warning: "feedback-warning-strong",
  positive: "feedback-positive-strong",
};

const OUTLINE_BORDER: Record<BadgeColor, ColorName> = {
  neutral: "feedback-neutral-strong",
  brand: "core-brand",
  negative: "feedback-negative-strong",
  warning: "feedback-warning-strong",
  positive: "feedback-positive-strong",
};

const LIGHT_BG: ColorName = "background_surface-secondary";

const INDICATOR_BG: Record<BadgeColor, ColorName> = {
  neutral: "icon-disabled",
  brand: "core-brand",
  negative: "feedback-negative",
  warning: "feedback-warning",
  positive: "feedback-positive",
};

const SIZES = {
  xs: { height: "1rem", paddingX: "0.375rem" }, // 16px / 6px
  sm: { height: "1.5rem", paddingX: "0.5rem" }, // 24px / 8px
} as const;

const isBadgeColor = (value: unknown): value is BadgeColor => {
  return BADGE_COLORS.some((color) => color === value);
};

type BadgeRootVars = Partial<
  Record<
    | "--badge-height"
    | "--badge-padding-x"
    | "--badge-fz"
    | "--badge-bg"
    | "--badge-color"
    | "--badge-bd",
    string
  >
>;

export const badgeOverrides = {
  Badge: Badge.extend({
    classNames: {
      root: BadgeStyles.root,
    },
    vars: (_theme, props) => {
      const { size, variant, color: badgeColor } = props;
      const isIndicator = "data-indicator" in props;
      const { height, paddingX } = SIZES[size === "sm" ? "sm" : "xs"];
      const root: BadgeRootVars = {
        "--badge-height": height,
        "--badge-padding-x": paddingX,
        "--badge-fz": "0.6875rem", // 11px
      };

      // Non-BadgeColor values fall through to Mantine's default resolver so
      // colors like "core-filter" can still work.
      if (isBadgeColor(badgeColor)) {
        if (isIndicator) {
          root["--badge-bg"] = color(INDICATOR_BG[badgeColor]);
        } else if (variant === "filled") {
          root["--badge-bg"] = color(FILLED_BG[badgeColor]);
          root["--badge-color"] = color(FILLED_TEXT[badgeColor]);
        } else if (variant === "light") {
          root["--badge-bg"] = color(LIGHT_BG);
          root["--badge-color"] = color(ACCENT_TEXT[badgeColor]);
        } else if (variant === "outline") {
          root["--badge-bg"] = "transparent";
          root["--badge-color"] = color(ACCENT_TEXT[badgeColor]);
          root["--badge-bd"] = `1px solid ${color(OUTLINE_BORDER[badgeColor])}`;
        }
      }

      return { root };
    },
  }),
};
