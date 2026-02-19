import type { UnknownAction } from "@reduxjs/toolkit";

import type {
  Card,
  CardId,
  Collection,
  CollectionId,
  Dashboard,
  DashboardId,
  Document,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

/**
 * Invalidation strategies for remote sync model mutations.
 */
export enum InvalidationType {
  /** Always invalidate on create/update/delete (for table children like fields, segments, measures) */
  Always = "always",
  /** Only invalidate if is_remote_synced changed or was already true */
  RemoteSyncedChange = "remote_synced_change",
  /** Check collection's is_remote_synced status */
  CollectionBased = "collection_based",
}

export type InvalidationStrategy =
  | { type: InvalidationType.Always }
  | {
      type: InvalidationType.RemoteSyncedChange;
      getOriginal: (
        state: State,
        id: number,
      ) => Card | Dashboard | Document | undefined;
    }
  | {
      type: InvalidationType.CollectionBased;
      getOriginalCollection: (
        state: State,
        id: CollectionId,
      ) => Collection | undefined;
    };

/**
 * Type for RTK Query endpoint matchers (matchFulfilled, matchPending, etc.)
 * These are type guard functions that narrow actions to their specific type.
 */
export type EndpointMatcher = (
  action: UnknownAction,
) => action is UnknownAction & { payload: unknown; meta: unknown };

export type ModelMutationConfig = {
  modelType: string;
  createEndpoints?: EndpointMatcher[];
  updateEndpoints?: EndpointMatcher[];
  deleteEndpoints?: EndpointMatcher[];
  invalidation: InvalidationStrategy;
  getDeleteId?: (action: UnknownAction) => number | { id: number } | undefined;
};

export type ModelWithRemoteSynced = {
  id: number | CardId | DashboardId;
  is_remote_synced?: boolean;
};
