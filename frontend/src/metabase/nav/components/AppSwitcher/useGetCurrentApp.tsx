import { match } from "ts-pattern";

import { useLocation } from "metabase/router";
import * as Urls from "metabase/urls";

// Ordered as the App switcher lists them.
export type CurrentApp =
  | "main"
  | "data-studio"
  | "embedding-hub"
  | "monitor"
  | "admin";

export const useGetCurrentApp = (): CurrentApp => {
  const location = useLocation();
  return match<string, CurrentApp>(location.pathname)
    .when(
      (path) => path.startsWith("/data-studio"),
      () => "data-studio",
    )
    .when(
      (path) => path.startsWith(Urls.embeddingHub()),
      () => "embedding-hub",
    )
    .when(
      (path) => path.startsWith("/monitor"),
      () => "monitor",
    )
    .when(
      (path) => path.startsWith("/admin"),
      () => "admin",
    )
    .otherwise(() => "main");
};
