import { match } from "ts-pattern";

import { useRouter } from "metabase/router";

export type CurrentApp = "main" | "admin" | "data-studio" | "monitor";

export const useGetCurrentApp = (): CurrentApp => {
  const { location } = useRouter();
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
    .otherwise(() => "main");
};
