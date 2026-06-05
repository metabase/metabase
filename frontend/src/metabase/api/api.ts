import type { BaseQueryFn } from "@reduxjs/toolkit/query/react";
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

import { api } from "metabase/api/client";
import { metabaseReduxContext } from "metabase/redux";

import { TAG_TYPES } from "./tags";

// Adapts our legacy API client to RTK Query's `BaseQueryFn` contract: pull the
// abort signal off the query lifecycle context and turn the client's
// resolve/throw into RTK's `{ data } | { error }` shape. All request-shaping and
// validation lives in the client itself.
export const baseQuery: BaseQueryFn = async (args, ctx, extraOptions) => {
  const requestArgs = typeof args === "string" ? { url: args } : args;
  try {
    const method = requestArgs.method ?? "GET";
    const data = await api.request({
      method: "GET",
      ...requestArgs,
      retry: method === "GET" || method === "POST",
      signal: ctx.signal,
      ...extraOptions,
    });
    return { data };
  } catch (error) {
    return { error };
  }
};

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
  baseQuery,
  endpoints: () => ({}),
});

export { skipToken };
