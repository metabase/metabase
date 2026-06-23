import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import type { ICloudAddOnProduct } from "metabase-types/api";

import { StoragePurchaseModal } from "./StoragePurchaseModal";
import { usePurchaseStorageAddOn } from "./use-purchase-storage-add-on";
import { useStorageAddOn } from "./use-storage-add-on";

interface StorageSetupContextValue {
  isSettingUp: boolean;
  storageAddOn: ICloudAddOnProduct | undefined;
  isLoadingStorageAddOn: boolean;
  isPurchaseModalOpened: boolean;
  openPurchaseModal: () => void;
  hasAttachedDwh: boolean;
  canSetUpStorage: boolean;
}

const StorageSetupContext = createContext<StorageSetupContextValue | null>(
  null,
);

interface StorageSetupProviderProps {
  children: ReactNode;
  /**
   * Pass `false` while the hosting UI is hidden to avoid fetching the add-ons
   * list (a Store API round-trip) eagerly. Purchase/setup state and its
   * polling keep running regardless.
   */
  enabled?: boolean;
}

/**
 * Holds the storage purchase + setup state so it is shared across the panels
 * that host the upsell and survives the Add data modal being closed and
 * reopened. It must be mounted *outside* the modal's `Modal.Root` so that the
 * polling in `usePurchaseStorageAddOn` keeps running while the modal is closed,
 * and so the purchase confirmation modal it renders can *replace* the hosting
 * modal (which hides itself while `isPurchaseModalOpened` is true) instead of
 * stacking on top of it.
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
    skip: !enabled,
  });
  const [
    isPurchaseModalOpened,
    { open: openPurchaseModal, close: closePurchaseModal },
  ] = useDisclosure(false);
  const [sendToast] = useToast();

  // Once setting-up ends the panels reveal their default view on their own
  // (they gate on `hasAttachedDwh`/`uploadsEnabled`). Fire once on the
  // transition out of setting-up: clear the shared purchase state, and toast
  // only when it ended because storage actually became ready (not on error).
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

export const useStorageSetup = (): StorageSetupContextValue => {
  const context = useContext(StorageSetupContext);

  if (!context) {
    throw new Error(
      "useStorageSetup must be used within a StorageSetupProvider",
    );
  }

  return context;
};
