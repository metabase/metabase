/**
 * Structural minimum of an RTK Query endpoint descriptor. Concrete endpoints from
 * RTK Query carry many extra properties (hooks, selectors, etc.) and concrete
 * argument/result types — we only rely on `initiate` here.
 */
type RTKEndpoint = { initiate: (request: any, options: any) => any };

type AnyDispatch = (action: any) => any;

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
  {
    forceRefetch = true,
    signal,
  }: { forceRefetch?: boolean; signal?: AbortSignal } = {},
): Promise<any> {
  const action = dispatch(endpoint.initiate(request, { forceRefetch }));

  const onAbort = () => action.abort?.();
  // The signal may already be aborted by the time we get here, in which case
  // the "abort" event has already fired and a listener wouldn't run.
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }

  try {
    return await action.unwrap();
  } finally {
    signal?.removeEventListener("abort", onAbort);
    action.unsubscribe?.();
  }
}
