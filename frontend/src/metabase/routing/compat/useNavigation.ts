import type { LocationDescriptor } from "history";
import { useCallback } from "react";
import {
  type NavigateOptions,
  type To,
  useNavigate as useNavigateV7,
} from "react-router-dom";

import { pushPath, replacePath } from "metabase/lib/navigation";

import { USE_V7_NAVIGATION } from "./config";

type NavigateFunction = (to: To | number, options?: NavigateOptions) => void;

interface NavigationActions {
  push: (path: LocationDescriptor | string) => void;
  replace: (path: LocationDescriptor | string) => void;
  goBack: () => void;
  navigate: NavigateFunction;
}

/**
 * Compatibility hook for navigation that works with both React Router v3 and v7.
 *
 * During migration:
 * - When USE_V7_NAVIGATION is false, uses react-router-redux dispatch actions
 * - When USE_V7_NAVIGATION is true, uses react-router-dom v7 useNavigate
 *
 * Usage:
 * ```tsx
 * const { push, replace, goBack, navigate } = useNavigation();
 *
 * // Navigate to a path
 * push('/dashboard/123');
 *
 * // Replace current history entry
 * replace('/dashboard/456');
 *
 * // Go back
 * goBack();
 *
 * // Use v7-style navigate (works in both modes)
 * navigate('/path', { replace: true });
 * navigate(-1); // go back
 * ```
 */
export const useNavigation = (): NavigationActions => {
  // Only call the appropriate hook based on which router is active
  // We cannot call v7 hooks when there's no v7 RouterProvider context
  if (USE_V7_NAVIGATION) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useNavigationV7();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useNavigationV3();
};

function useNavigationV7(): NavigationActions {
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
}

function useNavigationV3(): NavigationActions {
  const pushAction = useCallback((path: LocationDescriptor | string) => {
    pushPath(path);
  }, []);

  const replaceAction = useCallback((path: LocationDescriptor | string) => {
    replacePath(path);
  }, []);

  const goBackAction = useCallback(() => {
    window.history.back();
  }, []);

  const navigate = useCallback((to: To | number, options?: NavigateOptions) => {
    if (typeof to === "number") {
      // Go back/forward by number
      window.history.go(to);
    } else {
      const path = typeof to === "string" ? to : convertToV7Path(to);
      if (options?.replace) {
        replacePath(path);
      } else {
        pushPath(path);
      }
    }
  }, []);

  return {
    push: pushAction,
    replace: replaceAction,
    goBack: goBackAction,
    navigate,
  };
}

/**
 * Convert a v7 To object to a v3-compatible LocationDescriptor string
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
