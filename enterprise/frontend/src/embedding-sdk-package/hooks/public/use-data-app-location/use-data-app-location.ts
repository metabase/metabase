import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { SDK_BUNDLE_LOADED } from "embedding-sdk-shared/constants/event-names";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type UseDataAppLocationResult = {
  pathname: string;
  navigate: (to: string) => void;
};

const computeSubPath = (basename: string, pathname: string): string => {
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
      target?.addEventListener(SDK_BUNDLE_LOADED, handler);
      return () => {
        target?.removeEventListener(SDK_BUNDLE_LOADED, handler);
      };
    },
    () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.dataAppRouting,
    () => undefined,
  );

export const useDataAppLocation = (): UseDataAppLocationResult => {
  const dataAppRouting = useDataAppRouting();

  const getSubPath = useCallback(
    () =>
      dataAppRouting
        ? computeSubPath(
            dataAppRouting.getBasename(),
            dataAppRouting.getPathname(),
          )
        : "/",
    [dataAppRouting],
  );

  const [pathname, setPathname] = useState(getSubPath);

  useEffect(() => {
    if (!dataAppRouting) {
      return;
    }

    setPathname(getSubPath());

    return dataAppRouting.subscribe(() => {
      setPathname(getSubPath());
    });
  }, [dataAppRouting, getSubPath]);

  const navigate = useCallback(
    (to: string) => {
      dataAppRouting?.navigate(to);
    },
    [dataAppRouting],
  );

  return { pathname, navigate };
};
