import { useCallback } from "react";

import { type Location, useRouteLeaveBlocker } from "metabase/router";

import { useBeforeUnload } from "./use-before-unload";

interface UseConfirmLeaveModalInput {
  isEnabled: boolean;
  isLocationAllowed?: (location: Location | undefined) => boolean;
  // Decides blocking at navigation time, overriding the `isEnabled` +
  // `isLocationAllowed` pair for the blocker (but not for `useBeforeUnload`).
  // The pair is captured per render, so under React 19 a navigation can run
  // against a render that has not committed the latest dirty state yet and slip
  // through unblocked (metabase#76382). A caller that reads its dirty state from
  // a live source (the redux store) at call time is immune to that race.
  isBlocking?: (location: Location | undefined) => boolean;
}

interface UseConfirmLeaveModalResult {
  opened: boolean;
  close: () => void;
  confirm: () => void;
  nextLocation: Location | undefined;
}

// Nothing is allowed through by default: every destination gets the modal.
// Reload and tab close never reach here, they are `useBeforeUnload`'s job.
const BLOCK_EVERY_LOCATION = () => false;

// NOTE: there's a similar hook called useConfirmOnRouteLeave that should
// ported to use this format instead

/**
 * Provides props for using a Modal that is presented to users
 * whenever they try to leave a route
 */
export const useConfirmRouteLeaveModal = ({
  isEnabled,
  isLocationAllowed = BLOCK_EVERY_LOCATION,
  isBlocking,
}: UseConfirmLeaveModalInput): UseConfirmLeaveModalResult => {
  useBeforeUnload(isEnabled);

  const blocker = useRouteLeaveBlocker(({ nextLocation }) =>
    isBlocking
      ? isBlocking(nextLocation)
      : isEnabled && !isLocationAllowed(nextLocation),
  );

  // The blocker holds the attempted navigation, so confirming resumes it and
  // dismissing drops it. Neither has to reproduce the navigation by hand.
  const close = useCallback(() => blocker.reset?.(), [blocker]);
  const confirm = useCallback(() => blocker.proceed?.(), [blocker]);

  return {
    opened: blocker.state === "blocked",
    close,
    confirm,
    nextLocation: blocker.location,
  };
};
