import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Returns the bundle's `dataAppRouting` object, re-evaluating whenever
 * the bundle finishes loading.
 *
 * The bundle is attached to `window.METABASE_EMBEDDING_SDK_BUNDLE`
 * asynchronously after `<MetabaseProvider>` triggers it. Because
 * `<MetabaseProvider>` is memo'd and passes its children through as a
 * prop, bundle-load state changes inside the provider don't cause
 * sibling consumers to re-render. Subscribing to the
 * `metabase-sdk-bundle-loaded` event with `useSyncExternalStore` gives
 * the hook its own re-render signal so it can subscribe to routing
 * events once the bundle is up.
 */
const useDataAppRouting = () =>
  useSyncExternalStore(
    (notify) => {
      const handler = () => notify();
      const target = typeof document !== "undefined" ? document : null;

      target?.addEventListener("metabase-sdk-bundle-loaded", handler);

      return () => {
        target?.removeEventListener("metabase-sdk-bundle-loaded", handler);
      };
    },
    () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.dataAppRouting,
    () => undefined,
  );

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

/**
 * Returns the current data-app sub-path and a `navigate` function.
 *
 * @function
 * @category DataAppRouter
 */
export const useDataAppLocation = (): UseDataAppLocationResult => {
  const dataAppRouting = useDataAppRouting();

  // Basename never changes after mount: the iframe doesn't navigate to a
  // different `<name>`; that'd be a parent-level route change that
  // re-mounts the iframe entirely.
  const basename = useMemo(
    () => dataAppRouting?.getBasename() ?? "",
    [dataAppRouting],
  );

  const [pathname, setPathname] = useState(() => computeSubPath(basename));

  useEffect(() => {
    if (!dataAppRouting) {
      return;
    }

    // Re-sync immediately when the bundle becomes available — the
    // initial useState may have run before the basename was known.
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
