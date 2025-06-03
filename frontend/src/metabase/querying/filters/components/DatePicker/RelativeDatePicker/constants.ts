import { t } from "ttag";

import type { Tab } from "./types";

export const TABS: Tab[] = [
  {
    get label() {
      return t`Previous`;
    },
    direction: "last",
  },
  {
    get label() {
      return t`Current`;
    },
    direction: "current",
  },
  {
    get label() {
      return t`Next`;
    },
    direction: "next",
  },
];

export const DEFAULT_VALUE = {
  type: "relative",
  unit: "day",
  value: -30,
  offsetValue: undefined,
  offsetUnit: undefined,
} as const;
