import type { AnyAction, ThunkDispatch } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import { createDispatchHook, createSelectorHook } from "react-redux";

import { MetabaseReduxContext } from "metabase/lib/redux";

import type { MetabotStoreState } from "../state/types";

export const useMetabotSelector: TypedUseSelectorHook<MetabotStoreState> =
  createSelectorHook(MetabaseReduxContext);

export const useMetabotDispatch: () => ThunkDispatch<
  MetabotStoreState,
  void,
  AnyAction
> = createDispatchHook(MetabaseReduxContext);
