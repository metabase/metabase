import { t } from "ttag";

import { parseTimestamp } from "metabase/lib/time-dayjs";
import type {
  TransformRunStatus,
  TransformRunTrigger,
} from "metabase-types/api";

export function parseLocalTimestamp(timestamp: string) {
  return parseTimestamp(timestamp, null, true);
}

export function formatStatus(status: TransformRunStatus) {
  switch (status) {
    case "started":
      return t`In-progress`;
    case "succeeded":
      return t`Success`;
    case "failed":
      return `Failed`;
    case "timeout":
      return t`Timeout`;
  }
}

export function formatTrigger(trigger: TransformRunTrigger) {
  switch (trigger) {
    case "manual":
      return t`Manual`;
    case "cron":
      return t`Schedule`;
  }
}
