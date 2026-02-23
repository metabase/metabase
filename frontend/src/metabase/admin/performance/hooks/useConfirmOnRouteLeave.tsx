import { useEffect, useRef } from "react";

import { useBlockNavigation } from "metabase/routing";

type Props = {
  shouldConfirm: boolean;
  confirm: (onConfirm: () => void) => void;
};

export const useConfirmOnRouteLeave = ({ shouldConfirm, confirm }: Props) => {
  /**
   * to prevent endless loop
   */
  const confirmedRef = useRef<boolean>(false);
  const { isBlocked, nextLocation, proceed } = useBlockNavigation({
    isEnabled: shouldConfirm,
  });

  useEffect(() => {
    if (!isBlocked || confirmedRef.current || !shouldConfirm || !nextLocation) {
      return;
    }

    confirm(() => {
      confirmedRef.current = true;
      proceed();
    });
  }, [isBlocked, shouldConfirm, confirm, nextLocation, proceed]);
};
