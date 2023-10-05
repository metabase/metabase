import { t } from "ttag";
import type { DatePickerTruncationUnit } from "../types";
import type { Tab } from "./types";

export const TABS: Tab[] = [
  { type: "past", label: t`Past` },
  { type: "current", label: t`Current` },
  { type: "next", label: t`Next` },
];

export const UNIT_GROUPS: DatePickerTruncationUnit[][] = [
  ["day", "week", "month"],
  ["quarter", "year"],
];

export const DEFAULT_VALUE = {
  type: "relative",
  unit: "day",
  value: -30,
} as const;
