import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { Api, useListDatabasesQuery } from "metabase/api";
import { listTag, tag } from "metabase/api/tags";
import { useTokenRefreshUntil } from "metabase/api/utils";
import {
  useAttachedDwh,
  useHasTokenFeature,
  useSetting,
  useToast,
} from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { STORAGE_PRODUCT_TYPE } from "./use-storage-add-on";

export const POLL_INTERVAL_MS = 4000;

/** Setup lives only in this tab, so it needs its own deadline to stop spinning. */
export const STORAGE_SETUP_TIMEOUT_MS = 4 * 60 * 1000;

/** `failed` is terminal for the session; only another purchase or a reload clears it. */
type StorageSetupPhase = "idle" | "setting-up" | "failed";

/**
 * Storage setup as a session-local state machine.
 *
 * Deliberately not inferred from server state: an `attached_dwh` token with no
 * matching database is indistinguishable from a local hosted build or a plan
 * whose token runs ahead of the data, so inferring it put those admins in a
 * ten-minute polling spinner on every page load.
 *
 * A reload mid-setup therefore loses the spinner, but `canPurchaseStorage` keys
 * off the token feature so it can't re-offer storage they already bought.
 */
export function usePurchaseStorageAddOn() {
  const isHosted = useSetting("is-hosted?");
  const isAdmin = useSelector(getUserIsAdmin);
  const hasStorageTokenFeature = useHasTokenFeature("attached_dwh");
  const [sendToast] = useToast();
  const dispatch = useDispatch();

  const [purchaseCloudAddOn] = usePurchaseCloudAddOnMutation();

  const canPurchaseStorage = isHosted && isAdmin && !hasStorageTokenFeature;

  // Presence, not readiness: waiting for storage to accept uploads would never
  // finish for an admin who points uploads at a different database.
  const { hasAttachedDwh } = useAttachedDwh();

  const [phase, setPhase] = useState<StorageSetupPhase>("idle");

  const isSettingUp = phase === "setting-up";
  const hasSetupFailed = phase === "failed";

  useEffect(() => {
    if (!isSettingUp) {
      return;
    }

    const timer = setTimeout(
      () => setPhase("failed"),
      STORAGE_SETUP_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [isSettingUp]);

  // A condition rather than a transition, so it also covers storage that was
  // already there when setup started, and a background success that lands after
  // setup has locally timed out into `failed`.
  useEffect(() => {
    if (phase !== "idle" && hasAttachedDwh) {
      setPhase("idle");
      // Refetch every databases-list variant (the poll only refreshes the
      // `undefined` one) so the new Storage database surfaces as an upload
      // target, and `session-properties` so the admin Uploads form picks up the
      // flipped `uploads-settings`.
      dispatch(
        Api.util.invalidateTags([
          listTag("database"),
          tag("session-properties"),
        ]),
      );
      sendToast({
        icon: "check",
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Storage setup outcome, only visible to admins
        message: t`Metabase Storage is ready`,
      });
    }
  }, [phase, hasAttachedDwh, sendToast, dispatch]);

  // Refresh the token (a Store round-trip) until `attached_dwh` shows up, so the
  // rest of the app picks up the new plan without a reload.
  useTokenRefreshUntil("attached-dwh", {
    skip: !isSettingUp || hasStorageTokenFeature,
  });

  // A second subscription to the query `useAttachedDwh` makes, not a second
  // request. It exists only to attach polling while setup is in progress.
  useListDatabasesQuery(undefined, {
    skip: !isSettingUp,
    pollingInterval: POLL_INTERVAL_MS,
    skipPollingIfUnfocused: true,
  });

  const handlePurchase = useCallback(async () => {
    setPhase("setting-up");

    try {
      await purchaseCloudAddOn({ product_type: STORAGE_PRODUCT_TYPE }).unwrap();
    } catch {
      setPhase("idle");
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "feedback-warning",
        message: t`It looks like something went wrong. Please refresh the page and try again.`,
      });
    }
  }, [purchaseCloudAddOn, sendToast]);

  return {
    isSettingUp,
    hasSetupFailed,
    handlePurchase,
    canPurchaseStorage,
  };
}
