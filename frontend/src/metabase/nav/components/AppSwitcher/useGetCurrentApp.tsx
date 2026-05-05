import { match } from "ts-pattern";

import { useRouter } from "metabase/router";

export const useGetCurrentApp = () => {
  const { location } = useRouter();
  return match(location.pathname)
    .when(
      (path) => path.startsWith("/admin"),
      () => "admin",
    )
    .when(
      (path) => path.startsWith("/data-studio"),
      () => "data-studio",
    )
    .otherwise(() => "main");
};
