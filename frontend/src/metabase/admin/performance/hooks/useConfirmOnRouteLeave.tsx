import type { Location } from "history";
import { useEffect, useState } from "react";
import type { InjectedRouter, Route } from "react-router";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";

export const useConfirmOnRouteLeave = ({
  router,
  route,
  shouldConfirm,
  confirm,
}: {
  router?: InjectedRouter;
  route?: Route;
  shouldConfirm: boolean;
  confirm: (onConfirm: () => void) => void;
}) => {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [nextLocation, setNextLocation] = useState<Location>();

  useEffect(() => {
    if (!route || !router) {
      return;
    }
    const removeLeaveHook = router.setRouteLeaveHook(route, location => {
      if (shouldConfirm && !isConfirmed) {
        confirm(() => {
          setIsConfirmed(true);
          setNextLocation(location);
        });
        return false;
      }
    });
    return removeLeaveHook;
  }, [router, route, isConfirmed, shouldConfirm, confirm]);

  const dispatch = useDispatch();

  useEffect(() => {
    if (nextLocation) {
      dispatch(push(nextLocation));
    }
  }, [dispatch, nextLocation]);
};
