import { t } from "ttag";

import type { BadgeColor } from "metabase/ui";
import type {
  MetadataGenerationAttribute,
  MetadataGenerationRun,
  MetadataGenerationRunStatus,
} from "metabase-types/api";

export const RUN_POLLING_INTERVAL = 2000;

export const DEFAULT_ATTRIBUTES: MetadataGenerationAttribute[] = [
  "data_sensitivity",
  "semantic_type",
];

const ACTIVE_STATUSES: MetadataGenerationRunStatus[] = [
  "pending",
  "running",
  "canceling",
];

export function isRunActive(run: MetadataGenerationRun): boolean {
  return ACTIVE_STATUSES.includes(run.status);
}

export function canCancelRun(run: MetadataGenerationRun): boolean {
  return run.status === "pending" || run.status === "running";
}

export function canRetryRun(run: MetadataGenerationRun): boolean {
  return !isRunActive(run) && (run.table_errors?.length ?? 0) > 0;
}

export function getAttributeLabel(
  attribute: MetadataGenerationAttribute,
): string {
  switch (attribute) {
    case "data_sensitivity":
      return t`Data sensitivity`;
    case "semantic_type":
      return t`Semantic type`;
    case "description":
      return t`Description`;
  }
}

export function getRunStatusLabel(status: MetadataGenerationRunStatus): string {
  switch (status) {
    case "pending":
      return t`Waiting to start`;
    case "running":
      return t`Running`;
    case "canceling":
      return t`Canceling`;
    case "succeeded":
      return t`Done`;
    case "failed":
      return t`Failed`;
    case "canceled":
      return t`Canceled`;
    case "timeout":
      return t`Timed out`;
    case "usage_limit":
      return t`Stopped at the AI usage limit`;
  }
}

export function getRunStatusColor(
  status: MetadataGenerationRunStatus,
): BadgeColor {
  switch (status) {
    case "succeeded":
      return "positive";
    case "failed":
    case "timeout":
    case "usage_limit":
      return "negative";
    case "canceled":
    case "canceling":
      return "neutral";
    default:
      return "brand";
  }
}

export function getScopeLabel(run: MetadataGenerationRun): string {
  switch (run.scope.type) {
    case "database":
      return t`Whole database`;
    case "schemas":
      return run.scope.schemas.join(", ");
    case "tables":
      return run.scope.table_ids.length === 1
        ? t`1 table`
        : t`${run.scope.table_ids.length} tables`;
  }
}

export function getUnavailableMessage(reason: string): string {
  switch (reason) {
    case "metabot-disabled":
      return t`Metabot is disabled. Enable Metabot to generate metadata.`;
    case "no-llm":
      return t`No AI provider is configured for Metabot.`;
    case "usage-limit":
      return t`The AI usage limit has been reached.`;
    default:
      return t`AI metadata generation is not available: ${reason}.`;
  }
}

export function formatCost(costUsd: number): string {
  return costUsd < 0.01 ? "< $0.01" : `$${costUsd.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}
