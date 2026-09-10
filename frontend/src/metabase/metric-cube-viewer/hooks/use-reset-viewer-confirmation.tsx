import { useCallback } from "react";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";

import { trackMetricCubeViewerReset } from "../analytics";
import { useMetricCubeViewerContext } from "../context";

/** The "Reset viewer?" confirmation shared by the header menu and the settings modal. */
export function useResetViewerConfirmation(onReset?: () => void) {
  const { actions, generator } = useMetricCubeViewerContext();
  const { modalContent, show } = useConfirmation();

  const confirmReset = useCallback(() => {
    show({
      title: t`Reset viewer?`,
      message: t`This removes your card edits and filters and regenerates the default cards.`,
      confirmButtonText: t`Reset`,
      onConfirm: () => {
        actions.reset();
        trackMetricCubeViewerReset(generator.id);
        onReset?.();
      },
    });
  }, [show, actions, generator.id, onReset]);

  return { confirmReset, modalContent };
}
