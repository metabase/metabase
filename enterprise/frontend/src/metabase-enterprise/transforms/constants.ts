import { isCypressActive } from "metabase/env";
import { t } from "ttag";

export const NAME_MAX_LENGTH = 254;

export const POLLING_INTERVAL = isCypressActive ? 200 : 3000;

export const FILTER_WIDGET_MIN_WIDTH = 300;
export const FILTER_WIDGET_MAX_HEIGHT = 400;


export const SOURCE_STRATEGY_OPTIONS = [
  { value: "checkpoint" as const, label: t`Checkpoint` },
];

export const TARGET_STRATEGY_OPTIONS = [
  { value: "append" as const, label: t`Append` },
];
