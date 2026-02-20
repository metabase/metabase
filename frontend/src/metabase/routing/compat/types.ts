import type { Location } from "history";

export type CompatRoute = {
  path?: string;
  [key: string]: unknown;
};

export type CompatPlainRoute = CompatRoute;

export type CompatParams = Record<string, string | undefined>;

export type CompatInjectedRouter = {
  setRouteLeaveHook: (
    route: CompatRoute,
    hook: (location?: Location) => boolean | undefined,
  ) => () => void;
};
