import {
  buildCreateApi,
  coreModule,
  reactHooksModule,
  skipToken,
} from "@reduxjs/toolkit/query/react";
import {
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
} from "react-redux";

import { MetabaseReduxContext } from "metabase/lib/redux";

import { apiQuery } from "./query";
import { TAG_TYPES } from "./tags";

const createApi = buildCreateApi(
  coreModule(),
  reactHooksModule({
    hooks: {
      useDispatch: createDispatchHook(MetabaseReduxContext),
      useSelector: createSelectorHook(MetabaseReduxContext),
      useStore: createStoreHook(MetabaseReduxContext),
    },
  }),
);

export const Api = createApi({
  reducerPath: "metabase-api",
  tagTypes: TAG_TYPES,
  baseQuery: apiQuery,
  endpoints: () => ({}),
});

export { skipToken };
