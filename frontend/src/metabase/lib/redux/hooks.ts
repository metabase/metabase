import type { ThunkDispatch, AnyAction } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
/* eslint-disable no-restricted-imports */
import {
  useDispatch as useDispatchOriginal,
  useSelector as useSelectorOriginal,
} from "react-redux";
/* eslint-enable no-restricted-imports */

import type { State } from "metabase-types/store";

export const useDispatch: () => ThunkDispatch<State, void, AnyAction> =
  useDispatchOriginal;
export const useSelector: TypedUseSelectorHook<State> = useSelectorOriginal;
