import { useCallback } from "react";

import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { useDispatch } from "metabase/utils/redux";

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
