import { useCallback } from "react";

import { useDispatch } from "metabase/lib/redux";
import type { SdkIframeEmbedSetupModalProps } from "metabase/plugins";
import { setOpenModalWithProps } from "metabase/redux/ui";

export const useOpenEmbedJsWizard = ({
  initialState,
}: {
  initialState: SdkIframeEmbedSetupModalProps["initialState"];
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
