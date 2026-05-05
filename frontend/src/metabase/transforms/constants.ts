import { t } from "ttag";

import { isCypressActive } from "metabase/env";

export const NAME_MAX_LENGTH = 254;

export const POLLING_INTERVAL = isCypressActive ? 200 : 3000;

export const FILTER_WIDGET_MIN_WIDTH = 300;
export const FILTER_WIDGET_MAX_HEIGHT = 400;

export const INSPECTOR_UPSELL_CAMPAIGN = "data-studio-transform-inspector";
export const INSPECTOR_UPSELL_LOCATION = "data-studio-transform-inspector-page";

export const SOURCE_STRATEGY_OPTIONS = [
  {
    value: "checkpoint",
    get label() {
      return t`Checkpoint`;
    },
  },
];

export const TARGET_STRATEGY_OPTIONS = [
  {
    value: "append" as const,
    get label() {
      return t`Append`;
    },
  },
];
