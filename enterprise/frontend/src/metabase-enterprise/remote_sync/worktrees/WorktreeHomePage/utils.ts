import { msgid, ngettext, t } from "ttag";

import { isLibraryCollection } from "metabase/common/collections/utils";
import {
  type IconModel,
  type ObjectWithModel,
  modelIconMap,
} from "metabase/common/utils/icon";
import * as Urls from "metabase/urls";
import type {
  Collection,
  IconName,
  RemoteSyncEntity,
  RemoteSyncEntityModel,
  RemoteSyncTask,
  WorktreeId,
} from "metabase-types/api";

import { TRANSFORMS_ROOT_ID } from "../../displayGroups";

export type ChangeCounts = {
  added: number;
  modified: number;
  removed: number;
};

export function countChanges(entities: RemoteSyncEntity[]): ChangeCounts {
  const counts: ChangeCounts = { added: 0, modified: 0, removed: 0 };
  for (const { sync_status } of entities) {
    switch (sync_status) {
      case "create":
        counts.added += 1;
        break;
      case "delete":
      case "removed":
        counts.removed += 1;
        break;
      default:
        counts.modified += 1;
    }
  }
  return counts;
}

function isIconModel(
  model: RemoteSyncEntityModel,
): model is RemoteSyncEntityModel & IconModel {
  return model in modelIconMap;
}

const FALLBACK_ICONS: Partial<Record<RemoteSyncEntityModel, IconName>> = {
  field: "field",
  transformtag: "label",
  transformjob: "clock",
};

/**
 * The icon for a dirty entity, resolved through the app-wide entity icon lookup when the model is
 * one it knows, so questions get their visualization icon and collections their type icon.
 */
export function getEntityIcon(
  entity: RemoteSyncEntity,
  getIcon: (item: ObjectWithModel) => { name: IconName },
): IconName {
  if (isIconModel(entity.model)) {
    return getIcon({
      model: entity.model,
      id: entity.id,
      display: entity.display,
      authority_level: entity.authority_level,
    }).name;
  }
  return FALLBACK_ICONS[entity.model] ?? "unknown";
}

/**
 * Where to open a dirty entity from inside its worktree. Data Studio content gets its
 * worktree-scoped page; content without one falls back to the main app URL, and a few models
 * (tags, jobs, Python libraries) have no page of their own.
 */
export function getWorktreeEntityUrl(
  entity: RemoteSyncEntity,
  worktreeId: WorktreeId,
  collectionMap: Map<number, Collection>,
): string | null {
  switch (entity.model) {
    case "transform":
      return Urls.transform(entity.id, { worktreeId });
    case "nativequerysnippet":
      return Urls.dataStudioSnippet(entity.id, { worktreeId });
    case "metric":
      return Urls.dataStudioMetric(entity.id, { worktreeId });
    case "table":
      return Urls.dataStudioTable(entity.id, { worktreeId });
    case "measure":
      return entity.table_id != null
        ? Urls.dataStudioPublishedTableMeasure(entity.table_id, entity.id, {
            worktreeId,
          })
        : null;
    case "segment":
      return entity.table_id != null
        ? Urls.dataStudioPublishedTableSegment(entity.table_id, entity.id, {
            worktreeId,
          })
        : null;
    case "collection":
      return getWorktreeCollectionUrl(entity, worktreeId, collectionMap);
    case "field":
    case "transformtag":
    case "transformjob":
    case "pythonlibrary":
      return null;
    default:
      return Urls.modelToUrl(entity);
  }
}

function getWorktreeCollectionUrl(
  entity: RemoteSyncEntity,
  worktreeId: WorktreeId,
  collectionMap: Map<number, Collection>,
): string | null {
  if (entity.id === TRANSFORMS_ROOT_ID) {
    return Urls.transformList({ worktreeId });
  }
  const collection = collectionMap.get(entity.id);
  if (collection?.namespace === "transforms") {
    return Urls.transformList({ collectionId: entity.id, worktreeId });
  }
  if (collection != null && isLibraryCollection(collection)) {
    return Urls.dataStudioLibrary({ worktreeId });
  }
  return Urls.modelToUrl(entity);
}

/** One line describing how the worktree's most recent sync task ended. */
export function getSyncTaskSummary(task: RemoteSyncTask): string {
  const isPull = task.sync_task_type === "import";

  switch (task.status) {
    case "running":
      return isPull ? t`Pulling changes` : t`Pushing changes`;
    case "errored":
      return isPull ? t`Pull failed` : t`Push failed`;
    case "cancelled":
      return isPull ? t`Pull cancelled` : t`Push cancelled`;
    case "timed-out":
      return isPull ? t`Pull timed out` : t`Push timed out`;
    case "conflict":
      return isPull ? t`Pull hit conflicts` : t`Push hit conflicts`;
    case "successful":
      return getSuccessfulSyncSummary(task);
  }
}

function getSuccessfulSyncSummary(task: RemoteSyncTask): string {
  const outcome = task.outcome;
  switch (outcome?.kind) {
    case "pulled":
      return ngettext(
        msgid`Pulled ${outcome.count} item`,
        `Pulled ${outcome.count} items`,
        outcome.count,
      );
    case "pushed":
      return ngettext(
        msgid`Pushed ${outcome.count} item`,
        `Pushed ${outcome.count} items`,
        outcome.count,
      );
    case "merged":
      return t`Merged: pulled ${outcome.pulled}, pushed ${outcome.pushed}`;
    case "pull-skipped":
      return t`Nothing to pull`;
    case "push-skipped":
      return t`Nothing to push`;
    default:
      return task.sync_task_type === "import"
        ? t`Pulled changes`
        : t`Pushed changes`;
  }
}

export function isFailedSyncTask(task: RemoteSyncTask): boolean {
  return (
    task.status === "errored" ||
    task.status === "timed-out" ||
    task.status === "conflict"
  );
}
