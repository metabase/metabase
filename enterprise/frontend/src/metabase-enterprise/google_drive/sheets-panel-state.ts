import { match } from "ts-pattern";

import type { GdrivePayload } from "metabase-types/api";

/**
 * Everything the Google Sheets panel can show, as one value — the counterpart
 * to `CsvPanelState`. Plain strings rather than tagged objects, since no Sheets
 * state carries data.
 */
export type SheetsPanelState =
  | "provisioning-storage"
  | "storage-setup-failed"
  | "ask-admin"
  | "loading"
  | "needs-storage"
  | "storage-not-provisioned"
  | "unavailable"
  | "connection-details"
  | "connected"
  | "storage-full"
  | "not-connected"
  | "connecting"
  | "connection-error";

export interface SheetsPanelStateInput {
  isSettingUp: boolean;
  hasSetupFailed: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isLoadingStorageAddOn: boolean;
  hasAttachedDwh: boolean;
  hasStorageTokenFeature: boolean;
  showGdrive: boolean;
  areConnectionDetailsShown: boolean;
  status: GdrivePayload["status"];
}

export function getSheetsPanelState({
  isSettingUp,
  hasSetupFailed,
  isAdmin,
  isLoading,
  isLoadingStorageAddOn,
  hasAttachedDwh,
  hasStorageTokenFeature,
  showGdrive,
  areConnectionDetailsShown,
  status,
}: SheetsPanelStateInput): SheetsPanelState {
  if (isSettingUp) {
    return "provisioning-storage";
  }

  // `hasSetupFailed` can be a stale, session-cached verdict: setup may have timed
  // out locally yet completed in the background. Once the DWH is actually attached,
  // trust that over the cached failure rather than showing an error state.
  if (hasSetupFailed && !hasAttachedDwh) {
    return "storage-setup-failed";
  }

  if (!isAdmin) {
    return "ask-admin";
  }

  // Not first, unlike `getCsvPanelState`: the gates above answer without
  // waiting on a request. Below this line, storage and the service account both
  // read as absent until their queries land, which would flash an "add storage"
  // upsell at an admin who already has it.
  if (isLoading) {
    return "loading";
  }

  // Sheets only needs the DWH to exist, not to be the uploads target.
  if (!hasAttachedDwh) {
    // Already entitled to storage (token present) but the DWH database has not
    // shown up yet — provisioning, or a token that runs ahead of the data.
    // Offering to buy it again would be wrong; point at a refresh instead.
    if (hasStorageTokenFeature) {
      return "storage-not-provisioned";
    }

    // Until the add-on lands, `StoragePurchaseButton` cannot tell whether it is
    // the in-app purchase or the link out to the store, and would swap one for
    // the other mid-render.
    if (isLoadingStorageAddOn) {
      return "loading";
    }

    return "needs-storage";
  }

  // Some other `useShowGdrive` condition is unmet — nothing specific to say.
  if (!showGdrive) {
    return "unavailable";
  }

  if (areConnectionDetailsShown) {
    return "connection-details";
  }

  return match<GdrivePayload["status"], SheetsPanelState>(status)
    .with("active", "syncing", () => "connected")
    .with("paused", () => "storage-full")
    .with("not-connected", () => "not-connected")
    .with("initializing", () => "connecting")
    .with("error", () => "connection-error")
    .exhaustive();
}
