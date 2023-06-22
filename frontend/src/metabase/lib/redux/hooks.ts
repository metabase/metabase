import type { ThunkDispatch, AnyAction, Store } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import {
  useDispatch as useDispatchOriginal,
  useSelector as useSelectorOriginal,
  useStore as useStoreOriginal,
} from "react-redux";

import type { State } from "metabase-types/store";

export const useStore: () => Store<State, AnyAction> = useStoreOriginal;
export const useDispatch: () => ThunkDispatch<State, void, AnyAction> =
  useDispatchOriginal;
export const useSelector: TypedUseSelectorHook<State> = useSelectorOriginal;
