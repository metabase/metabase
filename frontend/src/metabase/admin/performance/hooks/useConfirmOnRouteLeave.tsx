import { useEffect, useRef } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { useRouter } from "metabase/router";

type Props = {
  shouldConfirm: boolean;
  confirm: (onConfirm: () => void) => void;
};

export const useConfirmOnRouteLeave = ({ shouldConfirm, confirm }: Props) => {
  const dispatch = useDispatch();
  const { router, routes } = useRouter();
  /**
   * to prevent endless loop
   */
  const confirmedRef = useRef<boolean>(false);
  const currentRoute = routes.at(-1);

  useEffect(
    () =>
      router.setRouteLeaveHook(currentRoute, (nextLocation) => {
        if (confirmedRef.current || !shouldConfirm) {
          return true;
        }
        /**
         * This will roll browser's URL back.
         * Returning false from this function cancels routing on the redux level, but browser's URL changes anyway.
         * So we need to roll this change back and then roll forward if user confirms.
         *
         * Unfortunately it won't work if user somewhere in the middle of history (e.g. has forward button available)
         */
        router.goForward();
        confirm(() => {
          confirmedRef.current = true;
          if (nextLocation) {
            dispatch(push(nextLocation));
          }
        });
        return false;
      }),
    [router, currentRoute, shouldConfirm, confirm, dispatch],
  );
};
