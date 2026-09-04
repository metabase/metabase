import { useEffect, useState } from "react";
import { t } from "ttag";

import type { GroupMappingSettingsState } from "./use-group-mapping-settings";
import type { JWTGroupSyncMode } from "./utils";

/** The backend stores no mode, so this derives it from the two settings and writes what each switch means */
export function useGroupMappingMode(groupMapping: GroupMappingSettingsState) {
  // manual without mappings only exists on the client, until the first mapping is saved
  const [isManualPending, setIsManualPending] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const hasMappings = Object.keys(groupMapping.mappings).length > 0;

  // pending manual ends once mappings exist, whether added here or brought in by a refetch
  useEffect(() => {
    if (hasMappings) {
      setIsManualPending(false);
    }
  }, [hasMappings]);

  let mode: JWTGroupSyncMode;
  if (isManualPending && !hasMappings) {
    mode = "manual";
  } else if (!groupMapping.syncEnabled) {
    mode = "off";
  } else if (hasMappings) {
    mode = "manual";
  } else {
    mode = "automatic";
  }

  const saveSyncEnabled = (enabled: boolean) =>
    groupMapping.saveSettings(
      { "jwt-group-sync": enabled },
      { successMessage: t`Changes saved` },
    );

  const switchOff = async () => {
    if (groupMapping.syncEnabled) {
      await saveSyncEnabled(false);
    }
  };

  // with mappings kept from before sync just turns back on, otherwise the first mapping does it
  const switchToManual = async () => {
    if (hasMappings) {
      await saveSyncEnabled(true);
    }
  };

  // automatic can't coexist with mappings, so those go through a confirmation first
  const switchToAutomatic = async () => {
    if (hasMappings) {
      setIsClearConfirmOpen(true);
      return;
    }
    if (!groupMapping.syncEnabled) {
      await saveSyncEnabled(true);
    }
  };

  const select = async (nextMode: JWTGroupSyncMode) => {
    // manual without mappings is the one switch that writes nothing yet
    setIsManualPending(nextMode === "manual" && !hasMappings);
    if (nextMode === "off") {
      await switchOff();
    }
    if (nextMode === "manual") {
      await switchToManual();
    }
    if (nextMode === "automatic") {
      await switchToAutomatic();
    }
  };

  const confirmClear = async () => {
    const saved = await groupMapping.saveSettings(
      { "jwt-group-sync": true, "jwt-group-mappings": {} },
      { successMessage: t`Changes saved` },
    );
    if (saved) {
      setIsClearConfirmOpen(false);
    }
  };

  return {
    mode,
    hasMappings,
    isClearConfirmOpen,
    select,
    confirmClear,
    cancelClear: () => setIsClearConfirmOpen(false),
  };
}
