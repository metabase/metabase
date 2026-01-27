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
export const apiQuery: BaseQueryFn = async (args, ctx, extraOptions) => {
  const method = typeof args === "string" ? "GET" : (args?.method ?? "GET");
  const url = typeof args === "string" ? args : args.url;
  const { bodyParamName, noEvent, formData, fetch } = args;

  if (!isAllowedHTTPMethod(method)) {
    return { error: "Invalid HTTP method" };
  }

  try {
    const response = await api[method](url)(
      // this will transform arrays to objects with numeric keys
      // we shouldn't be using top level-arrays in the API
      { ...args?.body, ...args?.params },
      {
        signal: ctx.signal,
        bodyParamName,
        noEvent,
        formData,
        fetch,
        ...extraOptions,
      },
    );
    return { data: response };
  } catch (error) {
    return { error };
  }
};
