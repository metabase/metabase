import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import {
  type Location,
  type MemoryTestRouterHolder,
  type RouteObject,
  RouterProviderMemory,
  toFacadeLocation,
  toRouteObjects,
} from "metabase/router";

// Router-only probes need the real app router, not Redux or themed UI providers.
export function renderWithRouter(
  children: ReactElement,
  options: { initialRoute?: string } = {},
) {
  return renderRoutesWithRouter(toRouteObjects(children), options);
}

export function renderRoutesWithRouter(
  routes: RouteObject[],
  { initialRoute = "/" }: { initialRoute?: string } = {},
) {
  const routerHolder: MemoryTestRouterHolder = { current: null };
  const utils = render(
    <RouterProviderMemory
      routes={routes}
      initialRoute={initialRoute}
      routerHolder={routerHolder}
    />,
  );
  const dataRouter = routerHolder.current;
  if (!dataRouter) {
    throw new Error("The router handle is only available after render");
  }

  return {
    ...utils,
    router: {
      // Keep the full test router's void return so sync act() does not wait for
      // a lazy destination before the test can inspect its pending state.
      navigate: (to: string, options?: { replace?: boolean }) => {
        dataRouter.navigate(to, options);
      },
      get location() {
        return toFacadeLocation(dataRouter.state.location);
      },
      back: () => {
        dataRouter.navigate(-1);
      },
      onLocationChange: (listener: (location: Location) => void) => {
        let lastKey = dataRouter.state.location.key;
        return dataRouter.subscribe(({ location }) => {
          if (location.key === lastKey) {
            return;
          }
          lastKey = location.key;
          listener(toFacadeLocation(location));
        });
      },
    },
  };
}
