import { t } from "ttag";

import { isCypressActive } from "metabase/env";

export const NAME_MAX_LENGTH = 254;

export const POLLING_INTERVAL = isCypressActive ? 200 : 3000;

export const FILTER_WIDGET_MIN_WIDTH = 300;
export const FILTER_WIDGET_MAX_HEIGHT = 400;

export const CHECKPOINT_TEMPLATE_TAG = "checkpoint";
export const SOURCE_STRATEGY_OPTIONS = [
  {
    value: CHECKPOINT_TEMPLATE_TAG,
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
