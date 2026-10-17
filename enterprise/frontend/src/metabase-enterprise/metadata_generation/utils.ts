import { t } from "ttag";

import type {
  MetadataGenerationAttribute,
  MetadataGenerationRun,
  MetadataGenerationRunRequest,
  MetadataGenerationRunStatus,
  MetadataGenerationScope,
} from "metabase-types/api";

export const RUN_POLLING_INTERVAL = 2000;

export const DEFAULT_ATTRIBUTES: MetadataGenerationAttribute[] = [
  "semantic_type",
  "data_sensitivity",
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

/** A finished run with at least one processed table has suggestions to review. */
export function canReviewRun(run: MetadataGenerationRun): boolean {
  return !isRunActive(run) && run.done_tables > 0;
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

export function getAttributePluralLabel(
  attribute: MetadataGenerationAttribute,
): string {
  switch (attribute) {
    case "data_sensitivity":
      return t`Data sensitivities`;
    case "semantic_type":
      return t`Semantic types`;
    case "description":
      return t`Descriptions`;
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

export function getRunTitle(scope: MetadataGenerationScope): string {
  switch (scope.type) {
    case "database":
      return t`Generating field metadata for this database`;
    case "schemas":
      return t`Generating field metadata for some schemas`;
    case "tables":
      return t`Generating field metadata for some tables`;
  }
}

/** The request that starts a run with the same scope and attributes as `run`. */
export function getRunRequest(
  run: MetadataGenerationRun,
): MetadataGenerationRunRequest {
  const request: MetadataGenerationRunRequest = {
    database_id: run.database_id,
    attributes: run.attributes,
  };
  switch (run.scope.type) {
    case "database":
      return request;
    case "schemas":
      return { ...request, schemas: run.scope.schemas };
    case "tables":
      return { ...request, table_ids: run.scope.table_ids };
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

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}
