import { t } from "ttag";

import type { BooleanPrototypeSetting, PrototypeSetting } from "./types";

export const INTEGRATED_OR_FILTERS: BooleanPrototypeSetting = {
  type: "boolean",
  key: "integrated-or-filters",
  get label() {
    return t`OR expression filters in query builder`;
  },
  defaultValue: true,
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  INTEGRATED_OR_FILTERS,
];
