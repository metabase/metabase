import { t } from "ttag";

import type { Tab } from "./types";

export const TABS: Tab[] = [
  {
    get label() {
      return t`Between`;
    },
    operator: "between",
  },
  {
    get label() {
      return t`Before`;
    },
    operator: "<",
  },
  {
    get label() {
      return t`On`;
    },
    operator: "=",
  },
  {
    get label() {
      return t`After`;
    },
    operator: ">",
  },
];
