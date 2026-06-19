import type { RequestMethod } from "./method";

export type RequestOptions<RawResponse extends boolean = boolean> = {
  noEvent?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Forwarded to the underlying `fetch` (e.g. `"no-store"` to skip the cache). */
  cache?: RequestCache;
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
