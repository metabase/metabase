import { t } from "ttag";

import type { MonitorRelayPhase } from "metabase-types/api";

export const STATUS_POLLING_INTERVAL_MS = 10_000;

export function getPhaseLabel(phase: MonitorRelayPhase): string {
  switch (phase) {
    case "waiting":
      return t`Waiting`;
    case "loading":
      return t`Loading history`;
    case "sealing":
      return t`Processing history`;
    case "live":
      return t`Live`;
  }
}
