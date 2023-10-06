import { t } from "ttag";
import type { DatePickerTruncationUnit } from "../types";
import type { Tab } from "./types";

export const TABS: Tab[] = [
  { label: t`Past`, direction: "last" },
  { label: t`Current`, direction: "current" },
  { label: t`Next`, direction: "next" },
];

export const UNIT_GROUPS: DatePickerTruncationUnit[][] = [
  ["day", "week", "month"],
  ["quarter", "year"],
];

export const DEFAULT_VALUE = {
  type: "relative",
  unit: "day",
  value: -30,
  offsetValue: undefined,
  offsetUnit: undefined,
} as const;
