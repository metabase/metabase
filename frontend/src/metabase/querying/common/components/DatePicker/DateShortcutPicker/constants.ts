import { t } from "ttag";

import type { ShortcutOption } from "../../../types";

import type { TypeOption } from "./types";

const DAY_WEEK_SHORTCUT_OPTIONS: ShortcutOption[] = [
  {
    get label() {
      return t`Today`;
    },
    shortcut: "today",
    direction: "current",
    value: {
      type: "relative",
      value: 0,
      unit: "day",
    },
  },
  {
    get label() {
      return t`Yesterday`;
    },
    shortcut: "yesterday",
    direction: "past",
    value: {
      type: "relative",
      value: -1,
      unit: "day",
    },
  },
  {
    get label() {
      return t`Previous week`;
    },
    shortcut: "previous-week",
    direction: "past",
    value: {
      type: "relative",
      value: -1,
      unit: "week",
    },
  },
  {
    get label() {
      return t`Previous 7 days`;
    },
    shortcut: "previous-7-days",
    direction: "past",
    value: {
      type: "relative",
      value: -7,
      unit: "day",
    },
  },
  {
    get label() {
      return t`Previous 30 days`;
    },
    shortcut: "previous-30-days",
    direction: "past",
    value: {
      type: "relative",
      value: -30,
      unit: "day",
    },
  },
];

const MONTH_SHORTCUT_OPTIONS: ShortcutOption[] = [
  {
    get label() {
      return t`Previous month`;
    },
    shortcut: "previous-month",
    direction: "past",
    value: {
      type: "relative",
      value: -1,
      unit: "month",
    },
  },
  {
    get label() {
      return t`Previous 3 months`;
    },
    shortcut: "previous-3-months",
    direction: "past",
    value: {
      type: "relative",
      value: -3,
      unit: "month",
    },
  },
  {
    get label() {
      return t`Previous 12 months`;
    },
    shortcut: "previous-12-months",
    direction: "past",
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
    get label() {
      return t`Fixed date range…`;
    },
    type: "specific",
    operators: ["=", "<", ">", "between"],
  },
  {
    get label() {
      return t`Relative date range…`;
    },
    type: "relative",
    operators: [],
  },
  {
    get label() {
      return t`Exclude…`;
    },
    type: "exclude",
    operators: ["!=", "is-null", "not-null"],
  },
];
