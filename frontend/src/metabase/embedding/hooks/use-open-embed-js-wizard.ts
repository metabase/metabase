import { useCallback } from "react";

import { openEmbedJsWizard } from "metabase/embedding/store/embed-setup-modal";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/embedding/types";
import { useDispatch } from "metabase/redux";

export const useOpenEmbedJsWizard = ({
  initialState,
}: {
  initialState: SdkIframeEmbedSetupModalInitialState;
}) => {
  const dispatch = useDispatch();

  return useCallback(
    ({ onBeforeOpen }: { onBeforeOpen?: () => void }) => {
      onBeforeOpen?.();

      dispatch(openEmbedJsWizard(initialState));
    },
    [dispatch, initialState],
  );
};
