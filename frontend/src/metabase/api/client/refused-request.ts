import type { RequestMethod } from "./method";

export type RefusedRequest = {
  method: RequestMethod;
  /** The request's path relative to the basename, with its querystring. */
  url: string;
};

/**
 * Called when the server refuses a request with a 401. Resolves true when the
 * request should be sent once more, for example after the caller has renewed
 * its credential.
 */
export type RefusedRequestHandler = (
  request: RefusedRequest,
) => Promise<boolean>;

let refusedRequestHandler: RefusedRequestHandler | null = null;

/** Set the handler for refused requests, or clear it with null. */
export function setRefusedRequestHandler(
  handler: RefusedRequestHandler | null,
) {
  refusedRequestHandler = handler;
}

export function getRefusedRequestHandler(): RefusedRequestHandler | null {
  return refusedRequestHandler;
}
