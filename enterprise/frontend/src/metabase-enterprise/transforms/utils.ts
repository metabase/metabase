import { t } from "ttag";

import { parseTimestamp } from "metabase/lib/time-dayjs";
import type {
  TransformRunMethod,
  TransformRunStatus,
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
    case "canceled":
      return t`Canceled`;
  }
}

export function formatRunMethod(trigger: TransformRunMethod) {
  switch (trigger) {
    case "manual":
      return t`Manual`;
    case "cron":
      return t`Schedule`;
  }
}
