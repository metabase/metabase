/**
 * Structural minimum of an RTK Query endpoint descriptor. Concrete endpoints from
 * RTK Query carry many extra properties (hooks, selectors, etc.) and concrete
 * argument/result types — we only rely on `initiate` here.
 */
type RTKEndpoint = { initiate: (request: any, options: any) => any };

type AnyDispatch = (action: any) => any;

type RunRtkEndpointOptions = {
  forceRefetch?: boolean;
  /**
   * Abort the in-flight request when this signal fires. Lets callers tie an
   * imperative dispatch into an external `AbortController` (e.g. cancelling a
   * stale fetch when the user navigates away), mirroring the `signal` option
   * the legacy API clients accept.
   */
  signal?: AbortSignal;
};

/**
 * Imperatively dispatch an RTK Query endpoint, await its result, and clean up
 * the subscription. Use this when you need an endpoint's data inside a thunk
 * or other non-component code path, where the `useFooQuery` hook isn't an
 * option.
 *
 * Pass a `signal` to cancel the in-flight request: it's wired to RTK Query's
 * `.abort()`, so aborts surface as the standard `DOMException` AbortError and
 * callers can `isAbortError`-check them.
 */
export async function runRtkEndpoint(
  request: unknown,
  dispatch: AnyDispatch,
  endpoint: RTKEndpoint,
  { forceRefetch = true, signal }: RunRtkEndpointOptions = {},
): Promise<any> {
  const action = dispatch(endpoint.initiate(request, { forceRefetch }));

  const abort = () => action.abort?.();
  if (signal?.aborted) {
    abort();
  }
  signal?.addEventListener("abort", abort);

  try {
    return await action.unwrap();
  } finally {
    signal?.removeEventListener("abort", abort);
    action.unsubscribe?.();
  }
}
