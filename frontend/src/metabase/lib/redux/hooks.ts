import type { ThunkDispatch, AnyAction } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import {
  useDispatch as useDispatchOriginal,
  useSelector as useSelectorOriginal,
} from "react-redux";

import type { State } from "metabase-types/store";

export const useDispatch: () => ThunkDispatch<State, void, AnyAction> =
  useDispatchOriginal;
export const useSelector: TypedUseSelectorHook<State> = useSelectorOriginal;
