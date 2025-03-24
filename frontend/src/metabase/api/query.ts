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
export const apiQuery: BaseQueryFn = async (args, ctx) => {
  const method = typeof args === "string" ? "GET" : (args?.method ?? "GET");
  const { bodyParamName, noEvent, formData, fetch } = args;

  if (!isAllowedHTTPMethod(method)) {
    return { error: "Invalid HTTP method" };
  }

  let url = typeof args === "string" ? args : args.url;

  // Apply URL encoding to path segments
  if (url) {
    const segments = url.split("/") as Array<string>;
    url = segments
      .map(segment => (segment ? encodeURIComponent(segment) : segment))
      .join("/");
  }

  try {
    const response = await api[method](url)(
      { ...args?.body, ...args?.params },
      {
        signal: ctx.signal,
        bodyParamName,
        noEvent,
        formData,
        fetch,
      },
    );
    return { data: response };
  } catch (error) {
    return { error };
  }
};
