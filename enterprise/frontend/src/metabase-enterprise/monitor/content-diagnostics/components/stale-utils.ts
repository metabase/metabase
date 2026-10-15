import { match } from "ts-pattern";
import { t } from "ttag";

import type { ContentDiagnosticsNonCollectionEntityType } from "metabase-types/api";

export function getLastActiveLabel(
  entityType: ContentDiagnosticsNonCollectionEntityType,
): string {
  return match(entityType)
    .with("card", () => t`Last used`)
    .with("dashboard", () => t`Last viewed`)
    .with("document", () => t`Last viewed`)
    .with("transform", () => t`Last run`)
    .exhaustive();
}

type ThresholdDaysFilterOption = {
  value: number;
  label: string;
};

export function getThresholdDaysFilterOptions(): ThresholdDaysFilterOption[] {
  return [
    { value: 90, label: t`90 days or more` },
    { value: 180, label: t`6 months or more` },
    { value: 365, label: t`1 year or more` },
  ];
}
