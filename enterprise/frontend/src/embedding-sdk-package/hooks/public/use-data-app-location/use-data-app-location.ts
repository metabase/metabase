import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type UseDataAppLocationResult = {
  pathname: string;
  navigate: (to: string) => void;
};

const computeSubPath = (basename: string): string => {
  if (typeof window === "undefined") {
    return "/";
  }

  const pathname = window.location.pathname;
  const subPath =
    basename && pathname.startsWith(basename)
      ? pathname.slice(basename.length)
      : pathname;

  return subPath || "/";
};

const useDataAppRouting = () =>
  useSyncExternalStore(
    (notify) => {
      const target = typeof document !== "undefined" ? document : null;
      const handler = () => notify();
      target?.addEventListener("metabase-sdk-bundle-loaded", handler);
      return () => {
        target?.removeEventListener("metabase-sdk-bundle-loaded", handler);
      };
    },
    () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.dataAppRouting,
    () => undefined,
  );

export const useDataAppLocation = (): UseDataAppLocationResult => {
  const dataAppRouting = useDataAppRouting();

  const basename = useMemo(
    () => dataAppRouting?.getBasename() ?? "",
    [dataAppRouting],
  );

  const [pathname, setPathname] = useState(() => computeSubPath(basename));

  useEffect(() => {
    if (!dataAppRouting) {
      return;
    }

    setPathname(computeSubPath(dataAppRouting.getBasename()));

    return dataAppRouting.subscribe(() => {
      setPathname(computeSubPath(dataAppRouting.getBasename()));
    });
  }, [dataAppRouting]);

  const navigate = useCallback(
    (to: string) => {
      dataAppRouting?.navigate(to);
    },
    [dataAppRouting],
  );

  return { pathname, navigate };
};
