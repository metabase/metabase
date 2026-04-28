import { useCallback } from "react";

import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";

export const useOpenEmbedJsWizard = ({
  initialState,
}: {
  initialState: SdkIframeEmbedSetupModalInitialState;
}) => {
  const dispatch = useDispatch();

  return useCallback(
    ({ onBeforeOpen }: { onBeforeOpen?: () => void }) => {
      onBeforeOpen?.();

      dispatch(
        setOpenModalWithProps({
          id: "embed",
          props: {
            initialState,
          },
        }),
      );
    },
    [dispatch, initialState],
  );
};
