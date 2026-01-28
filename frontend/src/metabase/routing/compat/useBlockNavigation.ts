import type { Location } from "history";
import { useCallback, useEffect, useState } from "react";
import type { InjectedRouter, Route } from "react-router";
import {
  useBlocker as useBlockerV7,
  useLocation as useLocationV7,
} from "react-router-dom";

import { USE_REACT_ROUTER_V7 } from "./config";
import { useNavigation } from "./useNavigation";

interface UseBlockNavigationInput {
  /**
   * Whether navigation blocking is enabled
   */
  isEnabled: boolean;
  /**
   * Optional function to determine if navigation to a location should be allowed
   */
  isLocationAllowed?: (location: Location | undefined) => boolean;
  /**
   * For v3: The router object from withRouter
   */
  router?: InjectedRouter;
  /**
   * For v3: The current route from withRouter
   */
  route?: Route;
}

interface UseBlockNavigationResult {
  /**
   * Whether the confirmation modal should be shown
   */
  isBlocked: boolean;
  /**
   * The location the user is trying to navigate to
   */
  nextLocation: Location | undefined;
  /**
   * Call this to allow the blocked navigation to proceed
   */
  proceed: () => void;
  /**
   * Call this to cancel the blocked navigation
   */
  cancel: () => void;
}

/**
 * Hook for blocking navigation and showing a confirmation modal.
 *
 * Works with both React Router v3 (using setRouteLeaveHook) and
 * React Router v7 (using useBlocker).
 *
 * Usage:
 * ```tsx
 * const { isBlocked, nextLocation, proceed, cancel } = useBlockNavigation({
 *   isEnabled: hasUnsavedChanges,
 *   isLocationAllowed: (loc) => loc?.pathname === '/allowed',
 * });
 *
 * return (
 *   <ConfirmModal
 *     opened={isBlocked}
 *     onConfirm={proceed}
 *     onCancel={cancel}
 *   />
 * );
 * ```
 */
export function useBlockNavigation({
  isEnabled,
  isLocationAllowed,
  router,
  route,
}: UseBlockNavigationInput): UseBlockNavigationResult {
  // Always call both hooks to satisfy rules of hooks
  const v7Result = useBlockNavigationV7({ isEnabled, isLocationAllowed });
  const v3Result = useBlockNavigationV3({
    isEnabled,
    isLocationAllowed,
    router,
    route,
  });

  if (USE_REACT_ROUTER_V7) {
    return v7Result;
  }
  return v3Result;
}

/**
 * v7 implementation using useBlocker
 */
function useBlockNavigationV7({
  isEnabled,
  isLocationAllowed,
}: Pick<
  UseBlockNavigationInput,
  "isEnabled" | "isLocationAllowed"
>): UseBlockNavigationResult {
  // Call useLocationV7 to ensure we're in a router context, even if we don't use the value
  useLocationV7();

  const blocker = useBlockerV7(({ currentLocation, nextLocation }) => {
    if (!isEnabled) {
      return false;
    }

    // Check if this location is allowed
    if (isLocationAllowed) {
      const nextLoc = {
        ...nextLocation,
        action: "PUSH" as const,
      } as Location;
      if (isLocationAllowed(nextLoc)) {
        return false;
      }
    }

    // Block if we're actually navigating to a different path
    return currentLocation.pathname !== nextLocation.pathname;
  });

  const nextLocation =
    blocker.state === "blocked"
      ? ({
          ...blocker.location,
          action: "PUSH" as const,
        } as Location)
      : undefined;

  return {
    isBlocked: blocker.state === "blocked",
    nextLocation,
    proceed: () => blocker.proceed?.(),
    cancel: () => blocker.reset?.(),
  };
}

/**
 * v3 implementation using setRouteLeaveHook
 */
function useBlockNavigationV3({
  isEnabled,
  isLocationAllowed,
  router,
  route,
}: UseBlockNavigationInput): UseBlockNavigationResult {
  const { push, replace, goBack } = useNavigation();
  const [nextLocation, setNextLocation] = useState<Location | undefined>();
  const [isBlocked, setIsBlocked] = useState(false);
  const [shouldProceed, setShouldProceed] = useState(false);

  const cancel = useCallback(() => {
    setIsBlocked(false);
    setNextLocation(undefined);
  }, []);

  const proceed = useCallback(() => {
    setShouldProceed(true);
  }, []);

  // Set up the route leave hook
  useEffect(() => {
    if (!router || !route) {
      return;
    }

    const removeLeaveHook = router.setRouteLeaveHook(
      route,
      (location?: Location) => {
        if (
          location &&
          isEnabled &&
          !shouldProceed &&
          !isLocationAllowed?.(location)
        ) {
          setIsBlocked(true);
          setNextLocation(location);
          return false;
        }
        return undefined;
      },
    );

    return removeLeaveHook;
  }, [router, route, isEnabled, shouldProceed, isLocationAllowed]);

  // Handle proceeding with navigation
  useEffect(() => {
    if (shouldProceed && nextLocation) {
      const action = nextLocation.action;
      if (action === "POP") {
        goBack();
      } else if (action === "PUSH") {
        push(nextLocation);
      } else if (action === "REPLACE") {
        replace(nextLocation);
      }
      // Reset state
      setShouldProceed(false);
      setIsBlocked(false);
      setNextLocation(undefined);
    }
  }, [shouldProceed, nextLocation, push, replace, goBack]);

  return {
    isBlocked,
    nextLocation,
    proceed,
    cancel,
  };
}
