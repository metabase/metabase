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
export const apiQuery: BaseQueryFn = async (args, ctx, extraOptions: any) => {
  const method = typeof args === "string" ? "GET" : args?.method ?? "GET";
  const url = typeof args === "string" ? args : args.url;

  if (!isAllowedHTTPMethod(method)) {
    return { error: "Invalid HTTP method" };
  }

  try {
    const abortSignalOption = ctx.signal ? { signal: ctx.signal } : undefined;
    const options = Object.assign(
      {},
      abortSignalOption,
      extraOptions?.requestOptions,
    );

    const response = await api[method](url)(
      { ...args?.body, ...args?.params },
      options,
    );
    return { data: response };
  } catch (error) {
    return { error };
  }
};
