import { type Reducer, combineReducers } from "@reduxjs/toolkit";
import { useContext } from "react";

import {
  MetabaseReduxContext,
  useDispatch,
  useStore,
} from "metabase/lib/redux";
import * as pulse from "metabase/notifications/pulse/reducers";
import { PLUGIN_REDUCERS } from "metabase/plugins";
import * as qb from "metabase/query_builder/reducers";
import { commonReducers } from "metabase/reducers-common";
import { DEFAULT_EMBEDDING_ENTITY_TYPES } from "metabase/redux/embedding-data-picker";
import { getStore } from "metabase/store";
import { reducer as visualizer } from "metabase/visualizer/visualizer.slice";

import { sdk } from "./reducer";
import type { SdkDispatch, SdkStore } from "./types";

export const buildSdkReducers = () =>
  ({
    ...commonReducers,
    pulse: combineReducers(pulse),
    qb: combineReducers(qb),
    visualizer,
    sdk,
    plugins: combineReducers({
      metabotPlugin: PLUGIN_REDUCERS.metabotPlugin,
    }),
  }) as unknown as Record<string, Reducer>;

/**
 * @deprecated Use `buildSdkReducers()` instead — it reads PLUGIN_REDUCERS at
 * call-time so the EE metabot reducer is picked up correctly.
 */
export const sdkReducers = buildSdkReducers();

export const getSdkStore = () =>
  getStore(buildSdkReducers(), null, {
    embed: {
      options: {
        entity_types: DEFAULT_EMBEDDING_ENTITY_TYPES,
      },
    },
    app: {
      isDndAvailable: false,
    },
  }) as unknown as SdkStore;

export const useSdkDispatch = () => {
  useCheckSdkReduxContext();

  return useDispatch() as SdkDispatch;
};

export const useSdkStore = () => {
  useCheckSdkReduxContext();

  return useStore() as SdkStore;
};

const useCheckSdkReduxContext = () => {
  const context = useContext(MetabaseReduxContext);

  if (!context) {
    console.warn(
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- not UI string
      "Cannot find react-redux context. Make sure component or hook is wrapped into MetabaseProvider",
    );
  }
};

export { useSdkSelector } from "./use-sdk-selector";
