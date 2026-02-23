import type { Location } from "history";
import { useCallback } from "react";
import {
  useBlocker as useBlockerV7,
  useLocation as useLocationV7,
} from "react-router-dom";

interface UseBlockNavigationInput {
  /**
   * Whether navigation blocking is enabled
   */
  isEnabled: boolean;
  /**
   * Optional function to determine if navigation to a location should be allowed
   */
  isLocationAllowed?: (location: Location | undefined) => boolean;
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
 * In v3 mode, router and route can be passed as props or will be
 * automatically obtained from RouterContext.
 *
 * Usage:
 * ```tsx
 * // Simple usage (router/route obtained from context)
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
}: UseBlockNavigationInput): UseBlockNavigationResult {
  return useBlockNavigationV7({ isEnabled, isLocationAllowed });
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
    proceed: useCallback(() => blocker.proceed?.(), [blocker]),
    cancel: useCallback(() => blocker.reset?.(), [blocker]),
  };
}
