import type { TypedUseSelectorHook } from "react-redux";
import { createSelectorHook } from "react-redux";

import { MetabaseReduxContext } from "metabase/lib/redux";

// TODO: use the real type after we figure out what it is
type EnterpriseState = any;

export const useEnterpriseSelector: TypedUseSelectorHook<EnterpriseState> =
  createSelectorHook(MetabaseReduxContext);
