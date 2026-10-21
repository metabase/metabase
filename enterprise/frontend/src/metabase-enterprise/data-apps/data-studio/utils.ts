import { t } from "ttag";

import type { DataApp } from "metabase-types/api";

type DataAppState = Pick<DataApp, "enabled" | "outdated">;

export function getDataAppStatusLabel({ enabled, outdated }: DataAppState) {
  if (enabled) {
    return outdated ? t`Live, outdated` : t`Live`;
  }
  return outdated ? t`Draft, outdated` : t`Draft`;
}
