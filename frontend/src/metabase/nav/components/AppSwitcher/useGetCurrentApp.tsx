import { match } from "ts-pattern";

import { useLocation } from "metabase/router";
import * as Urls from "metabase/urls";

export type CurrentApp =
  | "main"
  | "admin"
  | "data-studio"
  | "monitor"
  | "embedding-hub";

export const useGetCurrentApp = (): CurrentApp => {
  const location = useLocation();
  return match<string, CurrentApp>(location.pathname)
    .when(
      (path) => path.startsWith("/admin"),
      () => "admin",
    )
    .when(
      (path) => path.startsWith("/data-studio"),
      () => "data-studio",
    )
    .when(
      (path) => path.startsWith("/monitor"),
      () => "monitor",
    )
    .when(
      (path) => path.startsWith(Urls.embeddingHub()),
      () => "embedding-hub",
    )
    .otherwise(() => "main");
};
