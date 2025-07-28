import type { AnyAction, Store, ThunkDispatch } from "@reduxjs/toolkit";
import {
  type TypedUseSelectorHook,
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
} from "react-redux";

import { MetabaseReduxContext } from "metabase/lib/redux";

import type { ReportsStoreState } from "./types";

export const useReportsStore: () => Store<ReportsStoreState, AnyAction> =
  createStoreHook(MetabaseReduxContext);
export const useReportsDispatch: () => ThunkDispatch<
  ReportsStoreState,
  void,
  AnyAction
> = createDispatchHook(MetabaseReduxContext);
export const useReportsSelector: TypedUseSelectorHook<ReportsStoreState> =
  createSelectorHook(MetabaseReduxContext);
