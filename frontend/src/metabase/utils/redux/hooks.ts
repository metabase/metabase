import type { AnyAction, Store, ThunkDispatch } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import {
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
} from "react-redux";

import type { State } from "metabase/redux/store";

import { metabaseReduxContext } from "./custom-context";

export const useStore: () => Store<State, AnyAction> =
  createStoreHook(metabaseReduxContext);
export const useDispatch: () => ThunkDispatch<State, void, AnyAction> =
  createDispatchHook(metabaseReduxContext);
export const useSelector: TypedUseSelectorHook<State> =
  createSelectorHook(metabaseReduxContext);

export type DispatchFn = ReturnType<typeof useDispatch>;
