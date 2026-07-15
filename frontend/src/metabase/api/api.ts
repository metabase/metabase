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

// Extra cache-key material that callers can mix into a query arg to get a
// dedicated RTK cache entry — and thus an independent abort scope — per
// subscriber. It must never reach the server: endpoints commonly spread the
// arg into `params` or `body`, so it is stripped below, in the RTKQ adapter.
export const RTK_CACHE_KEY_PARAM = "__rtkCacheKey";

export type RtkCacheKeyed = { [RTK_CACHE_KEY_PARAM]?: unknown };

function omitRtkCacheKey(value: unknown): unknown {
  if (
    value == null ||
    typeof value !== "object" ||
    !(RTK_CACHE_KEY_PARAM in value)
  ) {
    return value;
  }
  const { [RTK_CACHE_KEY_PARAM]: _omitted, ...rest } = value;
  return rest;
}

function stripRtkCacheKey<T extends { params?: unknown; body?: unknown }>(
  requestArgs: T,
): T {
  const params = omitRtkCacheKey(requestArgs.params);
  const body = omitRtkCacheKey(requestArgs.body);
  if (params === requestArgs.params && body === requestArgs.body) {
    return requestArgs;
  }
  return {
    ...requestArgs,
    ...(params !== requestArgs.params ? { params } : null),
    ...(body !== requestArgs.body ? { body } : null),
  };
}

// Adapts our legacy API client to RTK Query's `BaseQueryFn` contract: pull the
// abort signal off the query lifecycle context and turn the client's
// resolve/throw into RTK's `{ data } | { error }` shape. All request-shaping and
// validation lives in the client itself.
export const baseQuery: BaseQueryFn = async (args, ctx, extraOptions) => {
  const requestArgs = stripRtkCacheKey(
    typeof args === "string" ? { url: args } : args,
  );
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
