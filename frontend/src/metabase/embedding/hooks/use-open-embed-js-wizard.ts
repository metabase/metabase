import { useCallback } from "react";

import { useDispatch } from "metabase/redux";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/redux/store/modal";
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
