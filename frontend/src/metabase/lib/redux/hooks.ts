import type { AnyAction, Store, ThunkDispatch } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import {
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
} from "react-redux";

import type { State } from "metabase-types/store";

import { MetabaseReduxContext } from "./custom-context";

export const useStore: () => Store<State, AnyAction> =
  createStoreHook(MetabaseReduxContext);
export const useDispatch: () => ThunkDispatch<State, void, AnyAction> =
  createDispatchHook(MetabaseReduxContext);
export const useSelector: TypedUseSelectorHook<State> =
  createSelectorHook(MetabaseReduxContext);

export type DispatchFn = ReturnType<typeof useDispatch>;
