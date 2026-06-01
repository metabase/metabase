import type { RequestMethod, RequestOptions } from "metabase/api/client";

import { api } from "./client";
import { splitTagParams } from "./client/utils";

/**
 * Legacy API method. Consumers across the codebase pass concrete request shapes
 * (e.g. `CreateDashboardRequest`) and rely on destructuring a concrete response,
 * so we use broad `any` types here to match the JS version's behaviour.
 */
export type ApiMethod<Raw extends boolean = boolean> = (
  rawData?: any,
  invocationOptions?: RequestOptions<Raw>,
  // Non-raw GET/POST/etc. stay `any` (not `unknown`) to preserve the legacy
  // loose typing the many existing call sites rely on; a literal
  // `rawResponse: true` still narrows the result to `Response`.
) => Promise<Raw extends true ? Response : any>;

export type MethodCreator = <Raw extends boolean = false>(
  urlTemplate: string,
  methodOptions?: RequestOptions<Raw>,
) => ApiMethod<Raw>;

// Legacy callers pack URL `:tag` values and the body into a single `rawData`
// bag; we split it here against the raw template, then hand `api.request` the
// RTK-style `{ params, body }` shape it expects. The split runs before
// URL-rewriting middleware (which only `api.request` sees), so legacy callers
// don't participate in embed URL overrides — none of the rewrite targets in
// `override-requests-for-embeds` go through the legacy helpers today.
function makeMethod(method: RequestMethod, retry: boolean): MethodCreator {
  return (urlTemplate, methodOptions = {}) =>
    async (rawData = {}, invocationOptions = {}) => {
      const options = { ...methodOptions, ...invocationOptions };
      const headers = {
        ...methodOptions.headers,
        ...invocationOptions.headers,
      };

      if (method === "GET") {
        // GET cannot carry a body; the whole bag becomes URL params (consumed
        // by `:tag`s first, leftover keys to the querystring).
        return api.request({
          ...options,
          method,
          url: urlTemplate,
          params: rawData,
          headers,
          retry,
        }) as any;
      }

      const { tagParams, leftover } = splitTagParams(urlTemplate, rawData);
      return api.request({
        ...options,
        method,
        url: urlTemplate,
        headers,
        retry,
        params: tagParams,
        body: Object.keys(leftover).length > 0 ? leftover : undefined,
      }) as any;
    };
}

export const GET = makeMethod("GET", true);
export const POST = makeMethod("POST", true);
export const PUT = makeMethod("PUT", false);
export const DELETE = makeMethod("DELETE", false);
