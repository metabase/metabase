import { t } from "ttag";
import _ from "underscore";

import { hasFeature } from "metabase/admin/databases/utils";
import type { OmniPickerCollectionItem } from "metabase/common/components/Pickers/EntityPicker/types";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  CollectionNamespace,
  Database,
  DatabaseId,
  DraftTransformSource,
  Transform,
  TransformRun,
  TransformRunMethod,
  TransformRunStatus,
  TransformSource,
} from "metabase-types/api";

import { CHECKPOINT_TEMPLATE_TAG } from "./constants";

export function parseTimestampWithTimezone(
  timestamp: string,
  systemTimezone: string | undefined,
) {
  const date = parseTimestamp(timestamp);
  if (systemTimezone == null) {
    return date;
  }
  try {
    return date.tz(systemTimezone);
  } catch {
    return date;
  }
}

export function formatStatus(status: TransformRunStatus | null) {
  switch (status) {
    case null:
      return t`Unknown`;
    case "started":
      return t`In progress`;
    case "succeeded":
      return t`Success`;
    case "failed":
      return `Failed`;
    case "timeout":
      return t`Timeout`;
    case "canceling":
      return t`Canceling`;
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

export function doesDatabaseSupportTransforms(database?: Database): boolean {
  if (!database) {
    return false;
  }

  return (
    !database.is_sample &&
    !database.is_audit &&
    !database.router_user_attribute &&
    !database.router_database_id &&
    hasFeature(database, "transforms/table")
  );
}

export function sourceDatabaseId(source: TransformSource): DatabaseId | null {
  if (source.type === "query") {
    return source.query.database;
  }

  if (source.type === "python") {
    return source["source-database"];
  }

  return null;
}

export function getTransformRunName(run: TransformRun): string {
  return run.transform?.name ?? t`Unknown transform`;
}

export function isErrorStatus(status: TransformRunStatus | null) {
  return status === "failed" || status === "timeout";
}

export function isTransformRunning(transform: Transform) {
  const lastRun = transform.last_run;
  return lastRun?.status === "started";
}

export function isTransformCanceling(transform: Transform) {
  const lastRun = transform.last_run;
  return lastRun?.status === "canceling";
}

export function isTransformSyncing(transform: Transform) {
  const lastRun = transform.last_run;

  // If the last run succeeded but there is no table yet, wait for the sync to
  // finish. If the transform is changed until the sync finishes, stop polling,
  // because the table could be already deleted.
  if (
    transform.table == null &&
    lastRun?.status === "succeeded" &&
    lastRun?.end_time != null
  ) {
    const endedAt = parseTimestamp(lastRun.end_time);
    const updatedAt = parseTimestamp(transform.updated_at);
    return endedAt.isAfter(updatedAt);
  }

  return false;
}

export function isSameSource(
  source1: DraftTransformSource,
  source2: DraftTransformSource,
) {
  if (source1.type === "query" && source2.type === "query") {
    return Lib.areLegacyQueriesEqual(source1.query, source2.query);
  }
  if (source1.type === "python" && source2.type === "python") {
    return _.isEqual(source1, source2);
  }
  return false;
}

export function isSourceEmpty(
  source: DraftTransformSource,
  databaseId: DatabaseId,
  metadata: Metadata,
): boolean {
  if (source.type !== "query") {
    return false;
  }

  const metadataProvider = Lib.metadataProvider(databaseId, metadata);
  const query = Lib.fromJsQuery(metadataProvider, source.query);
  const { isNative } = Lib.queryDisplayInfo(query);

  if (!isNative) {
    return false;
  }

  const nativeQuery = Lib.rawNativeQuery(query);
  return !nativeQuery?.trim();
}

export function isCompleteSource(
  source: DraftTransformSource,
): source is TransformSource {
  return source.type !== "python" || source["source-database"] != null;
}

const ALLOWED_TRANSFORM_VARIABLES = [CHECKPOINT_TEMPLATE_TAG];

export type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

export function getValidationResult(query: Lib.Query): ValidationResult {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    const tags = Object.values(Lib.templateTags(query));
    // Allow snippets, cards, and the special transform variables ({checkpoint})
    const hasInvalidTags = tags.some(
      (t) =>
        t.type !== "card" &&
        t.type !== "snippet" &&
        !ALLOWED_TRANSFORM_VARIABLES.includes(t.name),
    );
    if (hasInvalidTags) {
      return {
        isValid: false,
        errorMessage: t`In transforms, you can use snippets and question or model references, but not variables.`,
      };
    }
  }

  return { isValid: Lib.canSave(query, "question") };
}

export const getLibQuery = (
  source: DraftTransformSource,
  metadata: Metadata,
) => {
  if (source.type !== "query") {
    return null;
  }
  return Lib.fromJsQueryAndMetadata(metadata, source.query);
};

// Check if this is an MBQL query (not native SQL or Python)
export const isMbqlQuery = (
  source: DraftTransformSource,
  metadata: Metadata,
) => {
  const query = getLibQuery(source, metadata);
  if (!query) {
    return false;
  }
  return !Lib.queryDisplayInfo(query).isNative;
};

export const getRootCollectionItem = ({
  namespace,
}: {
  namespace: CollectionNamespace;
}): OmniPickerCollectionItem | null => {
  if (namespace === "transforms") {
    return {
      model: "collection",
      id: "root",
      namespace: "transforms",
      location: "/",
      name: t`Transforms`,
      here: ["collection"],
      below: ["table", "metric"],
    };
  }
  return null;
};
