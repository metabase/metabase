import type { RequestMethod } from "./method";

export type ResponseTransformer<T = unknown> = (opts: {
  /**
   * A cloned, unread `Response` for callers that need raw headers or stream.
   */
  response: Response;
}) => T;

export type RequestOptions<T = unknown> = {
  noEvent?: boolean;
  transformResponse?: ResponseTransformer<T>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type RequestClientInfo =
  | string
  | { name: string; version: string | null };

/**
 * Legacy API method. Consumers across the codebase pass concrete request shapes
 * (e.g. `CreateDashboardRequest`) and rely on destructuring a concrete response,
 * so we use broad `any` types here to match the JS version's behaviour.
 */
export type ApiMethod = (
  rawData?: any,
  invocationOptions?: RequestOptions,
) => Promise<any>;

export type MethodCreator = (
  urlTemplate: string,
  methodOptions?: RequestOptions,
) => ApiMethod;

export type ResponseErrorInfo = {
  metabaseVersion: string | null;
};

export type EventMap = {
  401: [string];
  403: [string];
  responseError: [ResponseErrorInfo];
};

export type RequestInit<T> = {
  method: RequestMethod;
  url: URL;
  body?: BodyInit;
  headers?: Record<string, string>;
} & RequestOptions<T>;
