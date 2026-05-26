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

import { metabaseReduxContext } from "metabase/redux";

import { apiQuery } from "./query";
import { TAG_TYPES } from "./tags";

const createApi = buildCreateApi(
  coreModule(),
  reactHooksModule({
    hooks: {
      useDispatch: createDispatchHook(metabaseReduxContext),
      useSelector: createSelectorHook(metabaseReduxContext),
      useStore: createStoreHook(metabaseReduxContext),
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
