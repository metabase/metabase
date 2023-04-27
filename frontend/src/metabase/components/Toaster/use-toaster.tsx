import { ReactNode, useCallback, useMemo, useState } from "react";

import Toaster from ".";

interface ToasterApi {
  isShown: boolean;
  show: ShowToaster;
  hide: HideToaster;
}

type ShowToaster = () => void;
type HideToaster = () => void;

export function useToaster(): [ToasterApi, ReactNode] {
  const [isShown, setIsShown] = useState<boolean>(false);

  const hide: HideToaster = useCallback(() => {
    setIsShown(false);
  }, []);

  const show: ShowToaster = useCallback(() => {
    setIsShown(true);
  }, []);

  // const toaster = options ? (
  //   <Toaster isShown={isShown} fixed onDismiss={hide} {...options} />
  // ) : null;

  const api = useMemo(
    () => ({
      isShown,
      show,
      hide,
    }),
    [hide, isShown, show],
  );

  return [api, Toaster];
}
