import type { Location } from "history";

export type RouterRoute = {
  path?: string;
  [key: string]: unknown;
};

export type PlainRoute = RouterRoute;

export type RouteParams = Record<string, string | undefined>;

export type RouterAdapter = {
  setRouteLeaveHook: (
    route: RouterRoute,
    hook: (location?: Location) => boolean | undefined,
  ) => () => void;
};
