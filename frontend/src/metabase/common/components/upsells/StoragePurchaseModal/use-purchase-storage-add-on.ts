import { useCallback, useState } from "react";
import { t } from "ttag";

import { useGetSettingsQuery, useListDatabasesQuery } from "metabase/api";
import { usePurchaseCloudAddOnMutation } from "metabase/api/cloud-add-ons";
import { useTokenRefreshUntil } from "metabase/api/utils";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks/useMetadataToasts";

import { STORAGE_PRODUCT_TYPE } from "./use-storage-add-on";

const POLL_INTERVAL_MS = 1000;

type State = "initial" | "settingUp";

export function usePurchaseStorageAddOn() {
  const [state, setState] = useState<State>("initial");
  // Whether we're actively polling the data sources below. Kept in state because
  // the stop condition (`isReady`) depends on the polled data itself, so we can't
  // reference it when configuring the queries — we reconcile it during render.
  const [isPolling, setIsPolling] = useState(false);
  const { sendErrorToast } = useMetadataToasts();
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();

  const hasStorage = useHasTokenFeature("attached_dwh");
  const uploadDbId = useSetting("uploads-settings")?.db_id;

  // Bust the server-side token cache so the `attached_dwh` feature shows up.
  useTokenRefreshUntil("attached-dwh", {
    intervalMs: POLL_INTERVAL_MS,
    skip: !isPolling,
  });

  // Reload both data sources the surrounding UI depends on: `uploads-settings`
  // (session properties) and the databases list.
  const { isFetching: isFetchingSettings } = useGetSettingsQuery(undefined, {
    pollingInterval: isPolling ? POLL_INTERVAL_MS : 0,
  });
  const { isFetching: isFetchingDatabases, data: databasesResponse } =
    useListDatabasesQuery(undefined, {
      pollingInterval: isPolling ? POLL_INTERVAL_MS : 0,
    });

  // Storage is only ready once the upload database has actually surfaced in the
  // databases list and accepts uploads — not merely when the token feature flips.
  const uploadDB = databasesResponse?.data?.find((db) => db.id === uploadDbId);
  const isReady = hasStorage && !!uploadDB?.can_upload;

  const isSettingUp = state === "settingUp";
  const shouldPoll = isSettingUp && !isReady;
  if (isPolling !== shouldPoll) {
    setIsPolling(shouldPoll);
  }

  const isReloading = shouldPoll || isFetchingSettings || isFetchingDatabases;

  const handlePurchase = useCallback(async () => {
    setState("settingUp");
    try {
      await purchaseCloudAddOn({ product_type: STORAGE_PRODUCT_TYPE }).unwrap();
    } catch {
      setState("initial");
      sendErrorToast(
        t`It looks like something went wrong. Please refresh the page and try again.`,
      );
    }
  }, [purchaseCloudAddOn, sendErrorToast]);

  const reset = useCallback(() => setState("initial"), []);

  return {
    state,
    isSettingUp,
    isPurchasing,
    isReady,
    isReloading,
    handlePurchase,
    reset,
  };
}
