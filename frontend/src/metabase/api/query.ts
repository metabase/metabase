import type { BaseQueryFn } from "@reduxjs/toolkit/query/react";

import api from "metabase/api/legacy-client";
import { isWebFormBody } from "metabase/api/utils/is-web-form-body";

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
  const { noEvent, formData, fetch, transformResponse } = args;

  if (!isAllowedHTTPMethod(method)) {
    return { error: "Invalid HTTP method" };
  }

  // Web-form bodies are forwarded as-is; other bodies merge with `params` so a
  // single combined object reaches the legacy client (which doesn't separate
  // them).
  const rawData = isWebFormBody(args?.body)
    ? args.body
    : { ...args?.body, ...args?.params };

  try {
    const response = await api[method](url)(rawData, {
      signal: ctx.signal,
      noEvent,
      formData,
      fetch,
      transformResponse,
      ...extraOptions,
    });
    return { data: response };
  } catch (error) {
    return { error };
  }
};
