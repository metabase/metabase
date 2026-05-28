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
 */
export async function runRtkEndpoint(
  request: unknown,
  dispatch: AnyDispatch,
  endpoint: RTKEndpoint,
  { forceRefetch = true } = {},
): Promise<any> {
  const action = dispatch(endpoint.initiate(request, { forceRefetch }));

  try {
    return await action.unwrap();
  } finally {
    action.unsubscribe?.();
  }
}
