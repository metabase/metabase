import type { LocationDescriptor } from "history";
import { useCallback } from "react";
import {
  type NavigateOptions,
  type To,
  useNavigate as useNavigateV7,
} from "react-router-dom";

type NavigateFunction = (to: To | number, options?: NavigateOptions) => void;

interface NavigationActions {
  push: (path: LocationDescriptor | string) => void;
  replace: (path: LocationDescriptor | string) => void;
  goBack: () => void;
  navigate: NavigateFunction;
}

export const useNavigation = (): NavigationActions => {
  const navigateV7 = useNavigateV7();

  const pushAction = useCallback(
    (path: LocationDescriptor | string) => {
      const to = typeof path === "string" ? path : convertToV7Path(path);
      navigateV7(to);
    },
    [navigateV7],
  );

  const replaceAction = useCallback(
    (path: LocationDescriptor | string) => {
      const to = typeof path === "string" ? path : convertToV7Path(path);
      navigateV7(to, { replace: true });
    },
    [navigateV7],
  );

  const goBackAction = useCallback(() => {
    navigateV7(-1);
  }, [navigateV7]);

  const navigate = useCallback(
    (to: To | number, options?: NavigateOptions) => {
      navigateV7(to as To, options);
    },
    [navigateV7],
  );

  return {
    push: pushAction,
    replace: replaceAction,
    goBack: goBackAction,
    navigate,
  };
};

/**
 * Keep support for v3-style LocationDescriptor/query objects.
 */
function convertToV7Path(to: To | LocationDescriptor): string {
  if (typeof to === "string") {
    return to;
  }

  let path = to.pathname || "";

  // Handle search/query params
  if ("search" in to && to.search) {
    path += to.search.startsWith("?") ? to.search : `?${to.search}`;
  } else if ("query" in to && to.query) {
    // v3-style query object
    const query = to.query as Record<string, string>;
    const searchParams = new URLSearchParams(query);
    const search = searchParams.toString();
    if (search) {
      path += `?${search}`;
    }
  }

  // Handle hash
  if (to.hash) {
    path += to.hash.startsWith("#") ? to.hash : `#${to.hash}`;
  }

  return path;
}
