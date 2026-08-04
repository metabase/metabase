import type { ComponentClass, FunctionComponent } from "react";
import type { Location, Path } from "react-router";

export type {
  Location,
  NavigateFunction,
  NavigateOptions,
  Params,
  Path,
  RelativeRoutingType,
  RouteObject,
  SetURLSearchParams,
  To,
  URLSearchParamsInit,
} from "react-router";

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
 * A location to navigate to, as an object. Carries the query as a `search`
 * string, the only form v7 reads; call sites that hold a query object serialize
 * it with `queryToSearch` first.
 */
export interface LocationDescriptorObject extends Partial<Path> {
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
 * A route's component. v3 accepted a class or function component; kept for the
 * call sites that annotate the injected `route` / `routes` props.
 */
export type RouteComponent = ComponentClass<any> | FunctionComponent<any>;
