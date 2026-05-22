import type { RequestMethod } from "./method";

export type RequestOptions<Raw extends boolean = boolean> = {
  noEvent?: boolean;
  /**
   * When `true`, resolve with the raw `Response` instead of the parsed body —
   * for callers that read it themselves (binary downloads, map tiles as a blob).
   * Passing a literal `true` narrows the resolved type to `Response`.
   */
  rawResponse?: Raw;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

/**
 * What a request resolves with: the raw `Response` when `rawResponse` is `true`,
 * otherwise the parsed body typed as `T`.
 */
export type ResponseFor<T, Raw extends boolean> = Raw extends true
  ? Response
  : T;

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
  invocationOptions?: RequestOptions,
) => Promise<ResponseFor<any, Raw>>;

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

export type RequestInit = {
  method: RequestMethod;
  url: URL;
  body?: BodyInit;
  headers?: Record<string, string>;
} & RequestOptions;
