import type { IndexRouteProps } from "react-router";

declare module "react-router" {
  export interface RouteProps<Props = any> extends IndexRouteProps<Props> {
    children?: React.ReactNode;
    path?: RoutePattern | undefined;
    app?: "data-studio" | "admin";
  }
}
