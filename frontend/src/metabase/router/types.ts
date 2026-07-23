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
 * The default parsed `query` shape: repeated keys become arrays, matching
 * history@3's parser that the `location.query` readers were written against.
 */
export type DefaultQuery = Record<string, string | string[] | null | undefined>;

/**
 * The parsed query object carried on a `Location`. The generic is the concrete
 * shape a call site knows its query to have (e.g. `Location<{ tab?: string }>`).
 */
export type Query<T = DefaultQuery> = T;

/**
 * The `state` carried through a navigation. history@3 typed this `any` and the
 * legacy route-prop readers were written against that; tightened when the
 * `state.routing` slice is thinned to the pure v7 shape (DEV-2290).
 */
export type LocationState = any;

/**
 * An entry in a history stack. Mirrors history@3's `Location`: alongside the URL
 * parts it carries the parsed `query` object and the navigation `action` that
 * the legacy route-prop call sites still read. The generic is the shape of
 * `query`, not `state`. Thinned to the pure v7 shape (no `query`/`action`) when
 * the `state.routing` slice is retired (DEV-2290).
 *
 * @see https://api.reactrouter.com/v7/interfaces/react-router.Location.html
 */
export interface Location<Q = DefaultQuery> {
  pathname: string;
  search: string;
  hash: string;
  query: Query<Q>;
  state: LocationState;
  action: Action;
  key: string;
}

/**
 * The loose query accepted when building a navigation target, where values may
 * still be numbers or other primitives before serialization. Mirrors history@3's
 * `QueryLike`, distinct from the parsed `DefaultQuery` a `Location` carries.
 */
type QueryLike = Record<string, any>;

/**
 * A location to navigate to, as an object. Mirrors history@3's
 * `LocationDescriptorObject`; the string form is `LocationDescriptor`.
 */
export interface LocationDescriptorObject {
  pathname?: string;
  search?: string;
  query?: QueryLike;
  hash?: string;
  state?: LocationState;
}

/**
 * A location to navigate to: either a path string or a descriptor object.
 * Mirrors history@3's `LocationDescriptor`.
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
export interface History<Q = DefaultQuery> {
  listenBefore(hook: TransitionHook): () => void;
  listen(listener: LocationListener): () => void;
  transitionTo(location: Location<Q>): void;
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
  ): Location<Q>;
  getCurrentLocation(): Location<Q>;
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
