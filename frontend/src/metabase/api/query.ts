import type { BaseQueryFn } from "@reduxjs/toolkit/query/react";

import api from "metabase/api/legacy-client";

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
  const { noEvent, rawResponse } = args;

  if (!isAllowedHTTPMethod(method)) {
    return { error: "Invalid HTTP method" };
  }

  if (Array.isArray(args?.body)) {
    return {
      error:
        "API bodies must be plain objects, not arrays — wrap the array in an object",
    };
  }

  try {
    const response = await api.request({
      method,
      url,
      body: args?.body,
      params: args?.params,
      signal: ctx.signal,
      noEvent,
      rawResponse,
      ...extraOptions,
    });
    return { data: response };
  } catch (error) {
    return { error };
  }
};
