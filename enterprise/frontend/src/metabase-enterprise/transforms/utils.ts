import { t } from "ttag";

import { parseTimestamp } from "metabase/lib/time-dayjs";
import type {
  TransformExecutionStatus,
  TransformExecutionTrigger,
} from "metabase-types/api";

export function parseLocalTimestamp(timestamp: string) {
  return parseTimestamp(timestamp, null, true);
}

export function formatStatus(status: TransformExecutionStatus) {
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

export function formatTrigger(trigger: TransformExecutionTrigger) {
  switch (trigger) {
    case "manual":
      return t`Manual`;
    case "cron":
      return t`Schedule`;
  }
}
