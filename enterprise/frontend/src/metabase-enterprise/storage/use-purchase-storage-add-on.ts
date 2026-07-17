import { useCallback } from "react";
import { t } from "ttag";

import { useGetSettingsQuery, useListDatabasesQuery } from "metabase/api";
import { useTokenRefreshUntil } from "metabase/api/utils";
import {
  useHasTokenFeature,
  useSetting,
  useToast,
} from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { STORAGE_PRODUCT_TYPE } from "./use-storage-add-on";

const POLL_INTERVAL_MS = 2000;

const STORAGE_PURCHASE_CACHE_KEY = "purchase-storage-add-on";

export function usePurchaseStorageAddOn() {
  const isHosted = useSetting("is-hosted?");
  const isAdmin = useSelector(getUserIsAdmin);
  const hasStorageTokenFeature = useHasTokenFeature("attached_dwh");
  const [sendToast] = useToast();

  const [
    purchaseCloudAddOn,
    { isLoading: isPurchasing, isSuccess: isPurchased, reset: resetPurchase },
  ] = usePurchaseCloudAddOnMutation({
    fixedCacheKey: STORAGE_PURCHASE_CACHE_KEY,
  });

  const canSetUpStorage = isHosted && isAdmin;

  const { data: databasesResponse } = useListDatabasesQuery(undefined, {
    skip: !canSetUpStorage,
  });
  // Until loaded, "no attached DWH" is indistinguishable from "not fetched yet".
  const areDatabasesLoaded = databasesResponse !== undefined;
  const hasAttachedDwh = !!databasesResponse?.data?.some(
    (db) => db.is_attached_dwh,
  );

  // Keeps us in setting-up from the POST until storage is ready; collapses on
  // its own on error (mutation no longer pending or successful).
  const isPurchaseSettingUp = isPurchasing || (isPurchased && !hasAttachedDwh);

  // Server-derived, so it survives the redeploy that provisioning triggers: the
  // token flips at purchase time, the DWH database only appears after redeploy.
  const isProvisioning =
    canSetUpStorage &&
    hasStorageTokenFeature &&
    areDatabasesLoaded &&
    !hasAttachedDwh;

  const isSettingUp = isPurchaseSettingUp || isProvisioning;

  // Refresh the token (a Store round-trip) until `attached_dwh` shows up.
  useTokenRefreshUntil("attached-dwh", {
    skip: !isSettingUp || hasStorageTokenFeature,
  });

  // While setting up, poll the two sources the surrounding UI reads: session
  // properties and the databases list.
  useGetSettingsQuery(undefined, {
    skip: !isSettingUp,
    pollingInterval: POLL_INTERVAL_MS,
    skipPollingIfUnfocused: true,
  });
  useListDatabasesQuery(undefined, {
    skip: !isSettingUp,
    pollingInterval: POLL_INTERVAL_MS,
    skipPollingIfUnfocused: true,
  });

  const handlePurchase = useCallback(async () => {
    try {
      await purchaseCloudAddOn({ product_type: STORAGE_PRODUCT_TYPE }).unwrap();
    } catch {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`It looks like something went wrong. Please refresh the page and try again.`,
      });
    }
  }, [purchaseCloudAddOn, sendToast]);

  return {
    isSettingUp,
    hasAttachedDwh,
    handlePurchase,
    resetPurchase,
    canSetUpStorage,
  };
}
