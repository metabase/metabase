/**
 * Structural minimum of an RTK Query endpoint descriptor. Concrete endpoints from
 * RTK Query carry many extra properties (hooks, selectors, etc.) and concrete
 * argument/result types — we only rely on `initiate` here.
 */
type RTKEndpoint = { initiate: (request: any, options: any) => any };

type AnyDispatch = (action: any) => any;

export async function entityCompatibleQuery(
  entityQuery: unknown,
  dispatch: AnyDispatch,
  endpoint: RTKEndpoint,
  { forceRefetch = true } = {},
): Promise<any> {
  const action = dispatch(endpoint.initiate(entityQuery, { forceRefetch }));

  try {
    return await action.unwrap();
  } finally {
    action.unsubscribe?.();
  }
}
