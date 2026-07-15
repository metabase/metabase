import type { ComponentType, ReactNode } from "react";
import { createContext, useContext } from "react";

import type { Route } from "./route";

const OutletContext = createContext<ReactNode>(null);

const RouteContext = createContext<Route | null>(null);

/**
 * The route matched for the nearest `element`-based route ancestor. On v3 the
 * matched route is injected as a `route` prop; this exposes it to `element`
 * routes, which are not passed props. Replaces threading the v3 `route` prop
 * through pages (e.g. for `setRouteLeaveHook`). Native `useMatch`/route context
 * takes over at the engine swap.
 */
export function useRoute(): Route | null {
  return useContext(RouteContext);
}

/**
 * react-router v7's `<Outlet>`: renders the matched child route (or nothing when
 * there is none). On v3 the child is injected as `props.children`, which
 * `withOutlet` exposes through context.
 *
 * @see https://reactrouter.com/7.18.1/api/components/Outlet
 */
export function Outlet(): JSX.Element {
  const child = useContext(OutletContext);
  return <>{child}</>;
}

type RouteWithElement = Route & { element?: ReactNode };

type RouteElementComponent = ComponentType<{
  children?: ReactNode;
  route?: RouteWithElement;
}>;

// The generated route `component` is keyed by the element's component *type*, not
// by element identity, and it renders the element off the v3-injected `route`.
// Two sibling routes that render the same component (`element={<X/>}` at
// `foo/:a` and `foo/:a/:b`) therefore share one `component`, so React reconciles
// `X` across a navigation between them instead of remounting it — matching v3's
// `component={X}` behaviour and preserving `X`'s state. It also keeps the
// component stable across v3's config rebuilds, so a `redirect()` element does
// not remount and re-fire its navigation in a loop.
const componentByType = new WeakMap<object, RouteElementComponent>();

/**
 * Turns a v7-style `element` into a react-router v3 route `component`. The child
 * route that v3 injects as `props.children` is exposed through context, letting
 * the element render it with `<Outlet/>`. This is how `<Route element={<X/>}>`
 * runs on v3.
 */
export function routeElementToComponent(
  element: ReactNode,
): RouteElementComponent {
  const type = elementType(element);
  if (type != null) {
    let cached = componentByType.get(type);
    if (!cached) {
      cached = makeRouteElementComponent();
      componentByType.set(type, cached);
    }
    return cached;
  }
  return makeRouteElementComponent();
}

// The component type of an element, usable as a WeakMap key (a component function
// or a `React.memo`/`forwardRef` object). Host tags (strings) and fragments
// (symbols) aren't keyable, so those fall back to a fresh, unmemoized component.
function elementType(element: ReactNode): object | null {
  if (element != null && typeof element === "object" && "type" in element) {
    // Narrowed to an object with a `type` key just above; read it as `unknown`
    // to classify the element's component type without assuming a React shape.
    const type = (element as { type: unknown }).type;
    if (typeof type === "function" || (typeof type === "object" && type)) {
      return type;
    }
  }
  return null;
}

function makeRouteElementComponent(): RouteElementComponent {
  return function RouteElement({ children, route }) {
    return (
      <RouteContext.Provider value={route ?? null}>
        <OutletContext.Provider value={children}>
          {route?.element}
        </OutletContext.Provider>
      </RouteContext.Provider>
    );
  };
}

/**
 * Wraps a v7-style component so it can be used as a react-router v3 route
 * `component`. The child route that v3 injects as `props.children` is exposed
 * through context, letting the wrapped component render it with `<Outlet/>`.
 */
export function withOutlet(
  Component: ComponentType,
): ComponentType<{ children?: ReactNode }> {
  return function RoutedComponent({ children }) {
    return (
      <OutletContext.Provider value={children}>
        <Component />
      </OutletContext.Provider>
    );
  };
}
