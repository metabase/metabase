import type { RequestMethod } from "./method";

export type RequestOptions<RawResponse extends boolean = boolean> = {
  noEvent?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * When `true`, resolve with the raw `Response` instead of the parsed body —
   * for callers that read it themselves (binary downloads, map tiles as a blob).
   * Passing a literal `true` narrows the resolved type to `Response`.
   */
  rawResponse?: RawResponse;
};

/**
 * What a request resolves with: the raw `Response` when `rawResponse` is `true`,
 * otherwise the parsed body typed as `T`.
 */
export type ResponseFor<Raw extends boolean> = Raw extends true
  ? Response
  : unknown;

export type RequestClientInfo =
  | string
  | { name: string; version: string | null };

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

export type ResponseErrorInfo = {
  metabaseVersion: string | null;
};

export type EventMap = {
  401: [string];
  403: [string];
  responseError: [ResponseErrorInfo];
};

export type RequestInit<RawResponse extends boolean = boolean> = {
  method: RequestMethod;
  url: URL;
  body?: BodyInit;
  headers?: Record<string, string>;
} & RequestOptions<RawResponse>;
