import type { TypedUseSelectorHook } from "react-redux";
import { createSelectorHook } from "react-redux";

import { metabaseReduxContext } from "metabase/api/context";

// TODO: use the real type after we figure out what it is
type EnterpriseState = any;

export const useEnterpriseSelector: TypedUseSelectorHook<EnterpriseState> =
  createSelectorHook(metabaseReduxContext);
