import type {
  CSSProperties,
  ComponentClass,
  FunctionComponent,
  HTMLProps,
  ReactNode,
} from "react";

/**
 * The pathname, search, and hash values of a URL.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.Path.html
 */
export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Describes a location that is the destination of some navigation, used in
 * Link, useNavigate, etc.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.To.html
 */
export type To = string | Partial<Path>;

/**
 * The navigation action that produced a location.
 */
export type Action = "POP" | "PUSH" | "REPLACE";

/**
 * The `state` carried through a navigation. history@3 typed this `any` and the
 * legacy route-prop readers were written against that; tightened once those call
 * sites migrate off the compat shape onto the pure v7 `Location`.
 */
export type LocationState = any;

/**
 * An entry in a history stack. Read the query string off `search`, either with
 * the `useSearchParams` hook or by constructing a `URLSearchParams`.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.Location.html
 */
export interface Location {
  pathname: string;
  search: string;
  hash: string;
  state: LocationState;
  key: string;
}

/**
 * A location to navigate to, as an object. Carries the query as a `search`
 * string, the only form v7 reads; call sites that hold a query object serialize
 * it with `queryToSearch` first.
 */
export interface LocationDescriptorObject {
  pathname?: string;
  search?: string;
  hash?: string;
  state?: LocationState;
}

/**
 * A location to navigate to: either a path string or a descriptor object.
 */
export type LocationDescriptor = LocationDescriptorObject | string;

type LocationListener = (location: Location) => void;
type TransitionHook = (
  location: Location,
  callback: (result: unknown) => void,
) => unknown;

/**
 * The `history` object interface the facade still passes around (the middleware
 * driver, the sync bridge, and the route-leave tests). Mirrors history@3's
 * `History` so the v3 engine and the v7 navigator both satisfy it.
 */
export interface History {
  listenBefore(hook: TransitionHook): () => void;
  listen(listener: LocationListener): () => void;
  transitionTo(location: Location): void;
  push(path: LocationDescriptor): void;
  replace(path: LocationDescriptor): void;
  go(n: number): void;
  goBack(): void;
  goForward(): void;
  createKey(): string;
  createPath(path: LocationDescriptor): string;
  createHref(path: LocationDescriptor): string;
  createLocation(
    path?: LocationDescriptor,
    action?: Action,
    key?: string,
  ): Location;
  getCurrentLocation(): Location;
}

/**
 * Whether a relative `to` is resolved against the route hierarchy or against
 * the current URL path.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.RelativeRoutingType.html
 */
export type RelativeRoutingType = "route" | "path";

/**
 * Options for the `navigate` function, mirroring react-router v7's
 * `NavigateOptions`.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.NavigateOptions.html
 */
export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
  relative?: RelativeRoutingType;
}

/**
 * The interface for the `navigate` function returned from `useNavigate`.
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.NavigateFunction.html
 */
export interface NavigateFunction {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
}

/**
 * The parameters that were parsed from the URL path.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.Params.html
 */
export type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

/**
 * Accepted inputs for building search params, mirroring react-router v7's
 * `URLSearchParamsInit`.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.URLSearchParamsInit.html
 */
export type URLSearchParamsInit =
  | string
  | URLSearchParams
  | [string, string][]
  | Record<string, string | string[]>;

/**
 * Sets new search params and causes a navigation when called.
 *
 * @see https://api.reactrouter.com/v7/types/react-router.SetURLSearchParams.html
 */
export type SetURLSearchParams = (
  nextInit?:
    | URLSearchParamsInit
    | ((prev: URLSearchParams) => URLSearchParamsInit),
  navigateOptions?: NavigateOptions,
) => void;

/**
 * A route's component. v3 accepted a class or function component; kept for the
 * call sites that annotate the injected `route` / `routes` props.
 */
export type RouteComponent = ComponentClass<any> | FunctionComponent<any>;

/**
 * The `<Route>` configuration props, re-homed from v3's `RouteProps`. The
 * lifecycle hooks (`onEnter` / `onChange` / `onLeave`) are intentionally absent:
 * they have no v7 equivalent and the app does that work in components now.
 */
export interface RouteProps {
  children?: ReactNode;
  path?: string;
  component?: RouteComponent;
}

/**
 * A route-leave hook: it receives the attempted destination and how it was
 * reached, and returns `false` to cancel the navigation. The navigation type is
 * a second argument rather than a field on the location, which carries only the
 * URL parts.
 */
export type RouteHook = (
  nextLocation?: Location,
  navigationType?: Action,
) => unknown;

/**
 * v3's function form of a `<Link to>`, kept because `RouterLink` still handles it.
 */
type ToLocationFunction = (location: Location) => LocationDescriptor;

/**
 * Props of the app's `<Link>`, re-homed from v3's `LinkProps`. `RouterLink` reads
 * `to` (and the active-styling props) and forwards the rest to the anchor.
 */
export interface RouterLinkProps extends HTMLProps<any> {
  to: LocationDescriptor | ToLocationFunction;
  activeClassName?: string;
  activeStyle?: CSSProperties;
  onlyActiveOnIndex?: boolean;
}
