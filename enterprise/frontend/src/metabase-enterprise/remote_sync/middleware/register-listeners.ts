import type {
  ListenerEffectAPI,
  ListenerMiddlewareInstance,
  ThunkDispatch,
  TypedStartListening,
  UnknownAction,
} from "@reduxjs/toolkit";
import { isAnyOf } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import type { Card, Collection, Dashboard, Document } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { REMOTE_SYNC_INVALIDATION_TAGS, TRANSFORMS_KEY } from "../constants";

import { MODEL_MUTATION_CONFIGS } from "./model-configs";
import {
  type EndpointMatcher,
  InvalidationType,
  type ModelMutationConfig,
  type ModelWithRemoteSynced,
} from "./model-invalidation-config";

type AppDispatch = ThunkDispatch<State, unknown, UnknownAction>;
type AppListenerEffectAPI = ListenerEffectAPI<State, AppDispatch>;
type AppStartListening = TypedStartListening<State, AppDispatch>;

/**
 * Wrapper type for the listener middleware that provides proper typing
 */
type TypedListenerMiddleware = {
  startListening: AppStartListening;
};

function invalidateRemoteSyncTags(dispatch: AppDispatch) {
  // Type assertion needed because Api is typed with base TagType,
  // but enterprise uses EnterpriseTagType which is a superset
  dispatch(Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as never));
}

function shouldInvalidateForRemoteSyncedModel(
  oldModel: Card | Dashboard | Document | undefined,
  newModel: Card | Dashboard | Document,
): boolean {
  const oldSynced = oldModel?.is_remote_synced ?? false;
  const newSynced = newModel.is_remote_synced ?? false;

  return oldSynced !== newSynced || newSynced;
}

function isTransformsSyncEnabled(state: State): boolean {
  return !!state.settings?.values?.[TRANSFORMS_KEY];
}

function shouldInvalidateForCollection(
  oldCollection: Collection | undefined,
  newCollection: Collection | undefined,
  state?: State,
): boolean {
  if (!newCollection) {
    return false;
  }

  const oldSynced = oldCollection?.is_remote_synced ?? false;
  const newSynced = newCollection.is_remote_synced ?? false;

  // Invalidate if the collection is remote synced (or was)
  if (oldSynced || newSynced) {
    return true;
  }

  // Also invalidate for transforms namespace collections when transforms sync is enabled
  if (
    state &&
    isTransformsSyncEnabled(state) &&
    newCollection.namespace === "transforms"
  ) {
    return true;
  }

  // Also invalidate for snippets namespace collections
  if (newCollection.namespace === "snippets") {
    return true;
  }

  return false;
}

/**
 * Helper to extract payload from an RTK action.
 * Returns undefined if the action doesn't have a payload property.
 */
function getActionPayload<T>(action: UnknownAction): T | undefined {
  if (action && typeof action === "object" && "payload" in action) {
    return action.payload as T;
  }
  return undefined;
}

/**
 * Creates a combined matcher from an array of endpoint matchers.
 * Type assertion is required because TypeScript cannot infer the union
 * of all action types when matchers are provided dynamically.
 */
function createMatcher(endpoints: EndpointMatcher[]) {
  // isAnyOf expects at least one argument, and we need to cast because
  // the dynamic array loses type information about the specific action types
  return isAnyOf(...(endpoints as [EndpointMatcher, ...EndpointMatcher[]]));
}

function registerCreateListeners(
  middleware: TypedListenerMiddleware,
  config: ModelMutationConfig,
) {
  if (!config.createEndpoints?.length) {
    return;
  }

  middleware.startListening({
    matcher: createMatcher(config.createEndpoints),
    effect: async (
      action: UnknownAction,
      { dispatch, getState }: AppListenerEffectAPI,
    ) => {
      const { invalidation } = config;

      switch (invalidation.type) {
        case InvalidationType.Always:
          invalidateRemoteSyncTags(dispatch);
          break;

        case InvalidationType.RemoteSyncedChange: {
          const payload = getActionPayload<ModelWithRemoteSynced>(action);
          if (payload?.is_remote_synced) {
            invalidateRemoteSyncTags(dispatch);
          }
          break;
        }

        case InvalidationType.CollectionBased: {
          const collection = getActionPayload<Collection>(action);
          if (
            shouldInvalidateForCollection(undefined, collection, getState())
          ) {
            invalidateRemoteSyncTags(dispatch);
          }
          break;
        }
      }
    },
  });
}

function registerUpdateListeners(
  middleware: TypedListenerMiddleware,
  config: ModelMutationConfig,
) {
  if (!config.updateEndpoints?.length) {
    return;
  }

  middleware.startListening({
    matcher: createMatcher(config.updateEndpoints),
    effect: async (
      action: UnknownAction,
      { getOriginalState, dispatch }: AppListenerEffectAPI,
    ) => {
      const { invalidation } = config;

      switch (invalidation.type) {
        case InvalidationType.Always:
          invalidateRemoteSyncTags(dispatch);
          break;

        case InvalidationType.RemoteSyncedChange: {
          const newModel = getActionPayload<Card | Dashboard | Document>(
            action,
          );
          if (!newModel) {
            break;
          }
          const oldModel = invalidation.getOriginal(
            getOriginalState(),
            newModel.id as number,
          );
          if (shouldInvalidateForRemoteSyncedModel(oldModel, newModel)) {
            invalidateRemoteSyncTags(dispatch);
          }
          break;
        }

        case InvalidationType.CollectionBased: {
          const newCollection = getActionPayload<Collection>(action);
          if (!newCollection) {
            break;
          }
          const originalState = getOriginalState();
          const oldCollection = invalidation.getOriginalCollection(
            originalState,
            newCollection.id,
          );
          if (
            shouldInvalidateForCollection(
              oldCollection,
              newCollection,
              originalState,
            )
          ) {
            invalidateRemoteSyncTags(dispatch);
          }
          break;
        }
      }
    },
  });
}

function registerDeleteListeners(
  middleware: TypedListenerMiddleware,
  config: ModelMutationConfig,
) {
  if (!config.deleteEndpoints?.length) {
    return;
  }

  middleware.startListening({
    matcher: createMatcher(config.deleteEndpoints),
    effect: async (
      action: UnknownAction,
      { getOriginalState, dispatch }: AppListenerEffectAPI,
    ) => {
      const { invalidation, getDeleteId } = config;

      switch (invalidation.type) {
        case InvalidationType.Always:
          invalidateRemoteSyncTags(dispatch);
          break;

        case InvalidationType.RemoteSyncedChange: {
          const id = getDeleteId?.(action);
          if (id == null) {
            break;
          }
          const model = invalidation.getOriginal(
            getOriginalState(),
            id as number,
          );
          if (model?.is_remote_synced) {
            invalidateRemoteSyncTags(dispatch);
          }
          break;
        }

        case InvalidationType.CollectionBased: {
          const deleteRequest = getDeleteId?.(action);
          const id =
            typeof deleteRequest === "object"
              ? deleteRequest?.id
              : deleteRequest;
          if (id == null) {
            break;
          }
          const originalState = getOriginalState();
          const collection = invalidation.getOriginalCollection(
            originalState,
            id,
          );
          if (
            shouldInvalidateForCollection(undefined, collection, originalState)
          ) {
            invalidateRemoteSyncTags(dispatch);
          }
          break;
        }
      }
    },
  });
}

/**
 * Registers all model mutation listeners based on the MODEL_MUTATION_CONFIGS.
 * This replaces the individual listener registrations with a data-driven approach.
 */
export function registerModelMutationListeners(
  middleware: ListenerMiddlewareInstance<State, AppDispatch>,
) {
  for (const config of MODEL_MUTATION_CONFIGS) {
    registerCreateListeners(middleware, config);
    registerUpdateListeners(middleware, config);
    registerDeleteListeners(middleware, config);
  }
}
