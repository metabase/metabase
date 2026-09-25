import { useCallback } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/common/hooks";

import type { SwitchAdvancedMode } from "../types";

type AdvancedModeMutation = readonly [
  () => { unwrap: () => Promise<unknown> },
  { isLoading: boolean },
];

type UseAdvancedModeSwitchOptions = {
  enable: AdvancedModeMutation;
  disable: AdvancedModeMutation;
};

type AdvancedModeSwitch = {
  enable: SwitchAdvancedMode;
  disable: SwitchAdvancedMode;
  isEnabling: boolean;
  isDisabling: boolean;
};

export function useAdvancedModeSwitch({
  enable: [enableAdvanced, { isLoading: isEnabling }],
  disable: [disableAdvanced, { isLoading: isDisabling }],
}: UseAdvancedModeSwitchOptions): AdvancedModeSwitch {
  const { sendErrorToast } = useMetadataToasts();

  const enable = useCallback(async () => {
    try {
      await enableAdvanced().unwrap();
      return true;
    } catch {
      sendErrorToast(t`Failed to switch to group-level permissions`);
      return false;
    }
  }, [enableAdvanced, sendErrorToast]);

  const disable = useCallback(async () => {
    try {
      await disableAdvanced().unwrap();
      return true;
    } catch {
      sendErrorToast(t`Failed to remove group-level access`);
      return false;
    }
  }, [disableAdvanced, sendErrorToast]);

  return { enable, disable, isEnabling, isDisabling };
}
