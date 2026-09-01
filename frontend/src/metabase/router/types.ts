import type { ComponentClass, FunctionComponent } from "react";

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
 * A route's component. v3 accepted a class or function component; kept for the
 * call sites that annotate the injected `route` / `routes` props.
 */
export type RouteComponent = ComponentClass<any> | FunctionComponent<any>;
