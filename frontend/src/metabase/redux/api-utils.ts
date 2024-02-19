import type { BaseQueryFn } from "@reduxjs/toolkit/query/react";

import api from "metabase/lib/api";
// TODO: move to a better file

// Custom Fetcher
type AllowedHTTPMethods = "GET" | "POST" | "PUT" | "DELETE";
const allowedHTTPMethods = new Set<AllowedHTTPMethods>([
  "GET",
  "POST",
  "PUT",
  "DELETE",
]);
const isAllowedHTTPMethod = (method: any): method is AllowedHTTPMethods => {
  return allowedHTTPMethods.has(method);
};

export const customBaseQuery: BaseQueryFn<
  any,
  unknown,
  unknown,
  any, // narrow down type (above are fine / same as rtkquery's fetchBaseQuery)
  any // narrow down type
> = async (args, ctx, extraOptions: any) => {
  const method = typeof args === "string" ? "GET" : args?.method;
  const url = typeof args === "string" ? args : args.url;

  if (!isAllowedHTTPMethod(method)) {
    return { error: "Invalid HTTP method" };
  }

  try {
    const abortControllerOption = ctx.signal
      ? { controller: ctx.signal }
      : undefined;
    const options = Object.assign(
      {},
      abortControllerOption,
      extraOptions?.requestOptions,
    );

    // TODO: does it matter that we construct the route on each request
    const data = await api[method](url)(args?.body, options);
    return { data };
  } catch (error) {
    return { error };
  }
};

// Cache utils

export const LIST_ID = "LIST" as const;

export function getListTag<T extends string>(tagType: T) {
  return { type: tagType, id: LIST_ID } as const;
}

export function providesList<
  Results extends { id: string | number }[],
  TagType extends string,
>(resultsWithIds: Results | undefined, tagType: TagType) {
  const listTag = getListTag(tagType);
  return resultsWithIds
    ? [listTag, ...resultsWithIds.map(({ id }) => ({ type: tagType, id }))]
    : [listTag];
}
