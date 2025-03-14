import type { Location } from "history";
import { useCallback, useEffect, useState } from "react";
import type { InjectedRouter, Route } from "react-router";
import { goBack, push, replace } from "react-router-redux";
import { match } from "ts-pattern";

import useBeforeUnload from "metabase/hooks/use-before-unload";
import { useDispatch } from "metabase/lib/redux";

interface UseConfirmLeaveModalInput {
  router: InjectedRouter;
  route: Route;
  isEnabled: boolean;
  isLocationAllowed?: (location: Location | undefined) => boolean;
}

interface UseConfirmLeaveModalResult {
  opened: boolean;
  close: () => void;
  confirm: () => void;
  nextLocation: Location | undefined;
}

/**
 * If there is no "location" then it's beforeunload event, which is
 * handled by useBeforeUnload hook - no reason to duplicate its work.
 */
export const IS_LOCATION_ALLOWED = (location?: Location) => !location;

// NOTE: there's a similar hook called useConfirmOnRouteLeave that should
// ported to use this format instead

/**
 * Provides props for using a Modal that is presented to users
 * whenever they try to leave a route
 */
export const useConfirmRouteLeaveModal = ({
  router,
  route,
  isEnabled,
  isLocationAllowed = IS_LOCATION_ALLOWED,
}: UseConfirmLeaveModalInput): UseConfirmLeaveModalResult => {
  const dispatch = useDispatch();
  const [nextLocation, setNextLocation] = useState<Location | undefined>();

  const [opened, setOpened] = useState<boolean>(false);
  const close = useCallback(() => setOpened(false), []);

  const [isConfirmed, setIsConfirmed] = useState(false);
  const confirm = useCallback(() => {
    setIsConfirmed(true);
    setOpened(false);
  }, []);

  useBeforeUnload(isEnabled);

  useEffect(() => {
    const removeLeaveHook = router.setRouteLeaveHook(route, location => {
      if (isEnabled && !isConfirmed && !isLocationAllowed?.(location)) {
        setOpened(true);
        setNextLocation(location);
        return false;
      }
    });

    return removeLeaveHook;
  }, [isLocationAllowed, router, route, isEnabled, isConfirmed]);

  useEffect(() => {
    if (isConfirmed && nextLocation) {
      setIsConfirmed(false);

      match(nextLocation.action)
        .with("POP", () => {
          /**
           * There is no simple or reliable way to detect how many pages is user going back,
           * so we use goBack() to go back just one page.
           * Ideally we should be using dispatch(go(numberOfPages));
           */
          dispatch(goBack());
        })
        .with("PUSH", () => {
          dispatch(push(nextLocation));
        })
        .with("REPLACE", () => {
          dispatch(replace(nextLocation));
        })
        .exhaustive();
    }
  }, [dispatch, isConfirmed, nextLocation]);

  return {
    opened,
    close,
    confirm,
    nextLocation,
  };
};
