import { useStorageSetup } from "metabase/common/components/upsells/StoragePurchaseModal";
import { useHasTokenFeature } from "metabase/common/hooks";

import { useAddDataState } from "./use-add-data-state";

/**
 * Everything the CSV panel can show, as one value. These cases overlap heavily,
 * so their precedence lives in one pure function rather than in independent
 * booleans that can contradict each other.
 */
export type CsvPanelState =
  | { type: "loading" }
  | { type: "provisioning-storage" }
  | { type: "storage-setup-failed" }
  | { type: "storage-not-provisioned" }
  | { type: "ask-admin" }
  | { type: "no-upload-permission" }
  | { type: "needs-uploads-setup"; canOfferStorage: boolean }
  | { type: "ready" };

export interface CsvPanelStateInput {
  areDatabasesLoading: boolean;
  areUploadsEnabled: boolean;
  canUploadToDatabase: boolean;
  canManageUploads: boolean;
  isSettingUp: boolean;
  hasSetupFailed: boolean;
  isLoadingStorageAddOn: boolean;
  hasAttachedDwh: boolean;
  hasStorageTokenFeature: boolean;
  canPurchaseStorage: boolean;
}

export function getCsvPanelState({
  areDatabasesLoading,
  areUploadsEnabled,
  canUploadToDatabase,
  canManageUploads,
  isSettingUp,
  hasSetupFailed,
  isLoadingStorageAddOn,
  hasAttachedDwh,
  hasStorageTokenFeature,
  canPurchaseStorage,
}: CsvPanelStateInput): CsvPanelState {
  // Before the list arrives, "cannot upload anywhere" is indistinguishable from
  // "not fetched yet", and guessing shows an answer that then flips.
  if (areDatabasesLoading) {
    return { type: "loading" };
  }

  // A working uploader outranks anything storage is doing — an in-flight
  // purchase must not take the uploader away for the minutes it takes to land.
  if (areUploadsEnabled && canUploadToDatabase) {
    return { type: "ready" };
  }

  if (isSettingUp) {
    return { type: "provisioning-storage" };
  }

  if (hasSetupFailed) {
    return { type: "storage-setup-failed" };
  }

  if (!areUploadsEnabled) {
    if (!canManageUploads) {
      return { type: "ask-admin" };
    }

    if (isLoadingStorageAddOn) {
      return { type: "loading" };
    }

    // Entitled to storage but the DWH database has not appeared yet (still
    // provisioning, or a token that runs ahead of the data). "Enable uploads"
    // would be a dead end, so point at a refresh instead.
    if (hasStorageTokenFeature && !hasAttachedDwh) {
      return { type: "storage-not-provisioned" };
    }

    return {
      type: "needs-uploads-setup",
      canOfferStorage: canPurchaseStorage && !hasAttachedDwh,
    };
  }

  // Uploads are enabled and the "ready" case above did not fire, so the upload
  // target exists but this user may not write to it.
  return { type: "no-upload-permission" };
}

/**
 * Gathered where the panel is rendered rather than threaded down from the
 * modal, the same way the Sheets panel does it.
 */
export function useCsvPanelState(): CsvPanelState {
  const {
    areDatabasesLoading,
    areUploadsEnabled,
    canUploadToDatabase,
    canManageUploads,
    hasAttachedDwh,
  } = useAddDataState();
  const {
    isSettingUp,
    hasSetupFailed,
    isLoadingStorageAddOn,
    canPurchaseStorage,
  } = useStorageSetup();
  const hasStorageTokenFeature = useHasTokenFeature("attached_dwh");

  // Listed field by field rather than spread: both hooks carry extra keys, and
  // a spread would let a rename here silently bind to the wrong hook's key.
  return getCsvPanelState({
    areDatabasesLoading,
    areUploadsEnabled,
    canUploadToDatabase,
    canManageUploads,
    hasAttachedDwh,
    hasStorageTokenFeature,
    isSettingUp,
    hasSetupFailed,
    isLoadingStorageAddOn,
    canPurchaseStorage,
  });
}
