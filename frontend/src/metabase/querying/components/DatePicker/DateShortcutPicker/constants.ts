import { t } from "ttag";
import type { ShortcutOption, TypeOption } from "./types";

const DAY_WEEK_SHORTCUT_OPTIONS: ShortcutOption[] = [
  {
    label: t`Today`,
    shortcut: "today",
    value: {
      type: "relative",
      value: "current",
      unit: "day",
    },
  },
  {
    label: t`Yesterday`,
    shortcut: "yesterday",
    value: {
      type: "relative",
      value: -1,
      unit: "day",
    },
  },
  {
    label: t`Last week`,
    shortcut: "last-week",
    value: {
      type: "relative",
      value: -1,
      unit: "week",
    },
  },
  {
    label: t`Last 7 days`,
    shortcut: "last-7-days",
    value: {
      type: "relative",
      value: -7,
      unit: "day",
    },
  },
  {
    label: t`Last 30 days`,
    shortcut: "last-30-days",
    value: {
      type: "relative",
      value: -30,
      unit: "day",
    },
  },
];

const MONTH_SHORTCUT_OPTIONS: ShortcutOption[] = [
  {
    label: t`Last month`,
    shortcut: "last-month",
    value: {
      type: "relative",
      value: -1,
      unit: "month",
    },
  },
  {
    label: t`Last 3 months`,
    shortcut: "last-3-months",
    value: {
      type: "relative",
      value: -3,
      unit: "month",
    },
  },
  {
    label: t`Last 12 months`,
    shortcut: "last-12-months",
    value: {
      type: "relative",
      value: -12,
      unit: "month",
    },
  },
];

export const SHORTCUT_OPTION_GROUPS: ShortcutOption[][] = [
  DAY_WEEK_SHORTCUT_OPTIONS,
  MONTH_SHORTCUT_OPTIONS,
];

export const TYPE_OPTIONS: TypeOption[] = [
  {
    label: t`Specific dates…`,
    type: "specific",
    operators: ["=", "<", ">", "between"],
  },
  {
    label: t`Relative dates…`,
    type: "relative",
    operators: [],
  },
  {
    label: t`Exclude…`,
    type: "exclude",
    operators: ["!=", "is-null", "not-null"],
  },
];
