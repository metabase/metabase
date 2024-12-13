import type { TypedUseSelectorHook } from "react-redux";
import { createSelectorHook } from "react-redux";

import { MetabaseReduxContext } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

import type { EnterpriseSharedState } from "./reducer";

export interface EnterpriseState extends State {
  plugins: {
    shared: EnterpriseSharedState;
  };
}

// TODO: find a better place
export const useEnterpriseSelector: TypedUseSelectorHook<EnterpriseState> =
  createSelectorHook(MetabaseReduxContext);
