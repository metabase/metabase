import type { LocationDescriptor } from "history";
import { useCallback } from "react";
import {
  useNavigate as useNavigateV7,
  type NavigateOptions,
  type To,
} from "react-router-dom";
import { goBack, push, replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";

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
  const dispatch = useDispatch();

  // For v7, we use the useNavigate hook directly
  // For v3, we create a shim that uses redux actions
  const navigateV7 = USE_V7_NAVIGATION ? useNavigateV7() : null;

  const pushAction = useCallback(
    (path: LocationDescriptor | string) => {
      if (USE_V7_NAVIGATION && navigateV7) {
        const to = typeof path === "string" ? path : convertToV7Path(path);
        navigateV7(to);
      } else {
        dispatch(push(path));
      }
    },
    [dispatch, navigateV7],
  );

  const replaceAction = useCallback(
    (path: LocationDescriptor | string) => {
      if (USE_V7_NAVIGATION && navigateV7) {
        const to = typeof path === "string" ? path : convertToV7Path(path);
        navigateV7(to, { replace: true });
      } else {
        dispatch(replace(path));
      }
    },
    [dispatch, navigateV7],
  );

  const goBackAction = useCallback(() => {
    if (USE_V7_NAVIGATION && navigateV7) {
      navigateV7(-1);
    } else {
      dispatch(goBack());
    }
  }, [dispatch, navigateV7]);

  const navigate = useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (USE_V7_NAVIGATION && navigateV7) {
        navigateV7(to as To, options);
      } else {
        if (typeof to === "number") {
          // Go back/forward by number
          if (to === -1) {
            dispatch(goBack());
          }
          // Note: v3 doesn't support go(n) for n != -1 easily
        } else {
          const path = typeof to === "string" ? to : convertToV7Path(to);
          if (options?.replace) {
            dispatch(replace(path));
          } else {
            dispatch(push(path));
          }
        }
      }
    },
    [dispatch, navigateV7],
  );

  return {
    push: pushAction,
    replace: replaceAction,
    goBack: goBackAction,
    navigate,
  };
};

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
