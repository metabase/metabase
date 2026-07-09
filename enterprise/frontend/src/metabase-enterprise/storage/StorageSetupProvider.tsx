import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import {
  StorageSetupContext,
  type StorageSetupContextValue,
  type StorageSetupProviderProps,
} from "metabase/common/components/upsells/StoragePurchaseModal";
import { useToast } from "metabase/common/hooks";

import { StoragePurchaseModal } from "./StoragePurchaseModal";
import { usePurchaseStorageAddOn } from "./use-purchase-storage-add-on";
import { useStorageAddOn } from "./use-storage-add-on";

/**
 * The real storage setup provider. It owns the cloud-add-ons endpoints, so it
 * lives in enterprise and is injected into the OSS Add data modal via
 * `PLUGIN_UPLOAD_MANAGEMENT.StorageSetupProvider` (hosted instances only),
 * supplying the `StorageSetupContext` that `useStorageSetup` reads.
 *
 * Must be mounted outside the modal's `Modal.Root` so its polling keeps running
 * while the modal is closed, and so the purchase confirmation modal it renders
 * replaces the host modal instead of stacking on it.
 */
export const StorageSetupProvider = ({
  children,
  enabled = true,
}: StorageSetupProviderProps) => {
  const {
    isSettingUp,
    hasAttachedDwh,
    handlePurchase,
    resetPurchase,
    canSetUpStorage,
  } = usePurchaseStorageAddOn();
  const { storageAddOn, isLoading: isLoadingStorageAddOn } = useStorageAddOn({
    skip: !enabled || !canSetUpStorage,
  });
  const [
    isPurchaseModalOpened,
    { open: openPurchaseModal, close: closePurchaseModal },
  ] = useDisclosure(false);
  const [sendToast] = useToast();

  // On the transition out of setting-up, clear the shared purchase state and
  // toast only if it ended because storage became ready (not on error).
  const wasSettingUp = usePrevious(isSettingUp);
  useEffect(() => {
    if (wasSettingUp && !isSettingUp) {
      resetPurchase();
      if (hasAttachedDwh) {
        sendToast({
          icon: "check",
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- Storage setup outcome, only visible to admins
          message: t`Metabase Storage is ready`,
        });
      }
    }
  }, [wasSettingUp, isSettingUp, hasAttachedDwh, resetPurchase, sendToast]);

  const value = useMemo<StorageSetupContextValue>(
    () => ({
      isSettingUp,
      storageAddOn,
      isLoadingStorageAddOn,
      isPurchaseModalOpened,
      openPurchaseModal,
      hasAttachedDwh,
      canSetUpStorage,
    }),
    [
      isSettingUp,
      storageAddOn,
      isLoadingStorageAddOn,
      isPurchaseModalOpened,
      openPurchaseModal,
      hasAttachedDwh,
      canSetUpStorage,
    ],
  );

  return (
    <StorageSetupContext.Provider value={value}>
      {children}

      {storageAddOn && canSetUpStorage && (
        <StoragePurchaseModal
          opened={isPurchaseModalOpened}
          onClose={closePurchaseModal}
          onConfirm={handlePurchase}
          storageAddOn={storageAddOn}
        />
      )}
    </StorageSetupContext.Provider>
  );
};
