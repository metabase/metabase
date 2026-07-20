import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";

import {
  StorageSetupContext,
  type StorageSetupContextValue,
  type StorageSetupProviderProps,
} from "metabase/common/components/upsells/StoragePurchaseModal";

import { StoragePurchaseModal } from "./StoragePurchaseModal";
import { usePurchaseStorageAddOn } from "./use-purchase-storage-add-on";
import { useStorageAddOn } from "./use-storage-add-on";

/**
 * The real storage setup provider, injected into the OSS Add data modal via
 * `PLUGIN_UPLOAD_MANAGEMENT.StorageSetupProvider` on hosted instances.
 *
 * Must be mounted outside the modal's `Modal.Root`, so its polling survives the
 * modal closing and its purchase modal replaces the host modal rather than
 * stacking on it.
 */
export const StorageSetupProvider = ({
  children,
  enabled = true,
}: StorageSetupProviderProps) => {
  const { isSettingUp, hasSetupFailed, handlePurchase, canPurchaseStorage } =
    usePurchaseStorageAddOn();
  const { storageAddOn, isLoading: isLoadingStorageAddOn } = useStorageAddOn({
    skip: !enabled || !canPurchaseStorage,
  });
  const [
    isPurchaseModalOpened,
    { open: openPurchaseModal, close: closePurchaseModal },
  ] = useDisclosure(false);

  const value = useMemo<StorageSetupContextValue>(
    () => ({
      isSettingUp,
      hasSetupFailed,
      storageAddOn,
      isLoadingStorageAddOn,
      isPurchaseModalOpened,
      openPurchaseModal,
      canPurchaseStorage,
    }),
    [
      isSettingUp,
      hasSetupFailed,
      storageAddOn,
      isLoadingStorageAddOn,
      isPurchaseModalOpened,
      openPurchaseModal,
      canPurchaseStorage,
    ],
  );

  return (
    <StorageSetupContext.Provider value={value}>
      {children}

      {storageAddOn && canPurchaseStorage && (
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
