import type { AnyAction, Store, ThunkDispatch } from "@reduxjs/toolkit";
import {
  type TypedUseSelectorHook,
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
} from "react-redux";

import { MetabaseReduxContext } from "metabase/lib/redux";

import type { DocumentsStoreState } from "./types";

export const useDocumentsStore: () => Store<DocumentsStoreState, AnyAction> =
  createStoreHook(MetabaseReduxContext);
export const useDocumentsDispatch: () => ThunkDispatch<
  DocumentsStoreState,
  void,
  AnyAction
> = createDispatchHook(MetabaseReduxContext);
export const useDocumentsSelector: TypedUseSelectorHook<DocumentsStoreState> =
  createSelectorHook(MetabaseReduxContext);
