import { t } from "ttag";

import type { Tab } from "./types";

export const LAST_TAB: Tab = {
  get label() {
    return t`Previous`;
  },
  direction: "past",
};

export const CURRENT_TAB: Tab = {
  get label() {
    return t`Current`;
  },
  direction: "current",
};

export const NEXT_TAB: Tab = {
  get label() {
    return t`Next`;
  },
  direction: "future",
};

export const TABS = [LAST_TAB, CURRENT_TAB, NEXT_TAB];

export const DEFAULT_VALUE = {
  type: "relative",
  unit: "day",
  value: -30,
  offsetValue: undefined,
  offsetUnit: undefined,
} as const;
