import { useCallback } from "react";
import { t } from "ttag";

import { useGetSettingsQuery, useListDatabasesQuery } from "metabase/api";
import { usePurchaseCloudAddOnMutation } from "metabase/api/cloud-add-ons";
import { useTokenRefreshUntil } from "metabase/api/utils";
import {
  useHasTokenFeature,
  useSetting,
  useToast,
} from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

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
  const attachedDwhDatabase = databasesResponse?.data?.find(
    (db) => db.is_attached_dwh,
  );
  const hasAttachedDwh = !!attachedDwhDatabase?.can_upload;

  // A purchase made in this session keeps us in setting-up from the POST until
  // storage is ready. On error the mutation is no longer pending or successful,
  // so this collapses on its own — no manual state juggling.
  const isPurchaseSettingUp = isPurchasing || (isPurchased && !hasAttachedDwh);

  // Derived purely from server state, so it survives a reload (including the
  // redeploy that provisioning itself triggers): the token flips synchronously
  // at purchase time while the DWH database only appears once the instance has
  // redeployed.
  const isProvisioning =
    canSetUpStorage && hasStorageTokenFeature && !hasAttachedDwh;

  const isSettingUp = isPurchaseSettingUp || isProvisioning;

  // Bust the server-side token cache so the `attached_dwh` feature shows up.
  // Each refresh is a round-trip to the Store, so it runs at the hook's slower
  // default interval and stops once the feature has flipped.
  useTokenRefreshUntil("attached-dwh", {
    skip: !isSettingUp || hasStorageTokenFeature,
  });

  // While setting up, poll both data sources the surrounding UI depends on:
  // session properties (`uploads-settings` etc.) and the databases list. These
  // are extra subscriptions to the same cache entries used above, kept alive
  // only for their polling; the data is read through the always-on reads.
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
