import type { BaseQueryFn } from "@reduxjs/toolkit/query/react";

import api from "metabase/lib/api";

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

// custom fetcher that wraps our Api client
export const apiQuery: BaseQueryFn<
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

    // ????: perf overhead to contrusting the method on each call
    const data = await api[method](url)(args?.body, options);
    return { data };
  } catch (error) {
    return { error };
  }
};
