import { t } from "ttag";
import type { Tab } from "./types";

export const TABS: Tab[] = [
  { label: t`Between`, operator: "between" },
  { label: t`Before`, operator: "<" },
  { label: t`On`, operator: "=" },
  { label: t`After`, operator: ">" },
];
