import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { ICloudAddOnProduct } from "metabase-types/api";

export interface StorageSetupContextValue {
  /** This admin bought storage in this tab and it has not shown up yet. */
  isSettingUp: boolean;
  /** Setup ran past its deadline; the panels offer a way out instead of spinning. */
  hasSetupFailed: boolean;
  storageAddOn: ICloudAddOnProduct | undefined;
  isLoadingStorageAddOn: boolean;
  isPurchaseModalOpened: boolean;
  openPurchaseModal: () => void;
  /**
   * A hosted admin without the `attached_dwh` token. The token flips at purchase
   * time, so a reload mid-setup can't re-offer storage they already bought.
   */
  canPurchaseStorage: boolean;
}

// Whether the instance *has* storage is deliberately absent: consumers read it
// from `useAttachedDwh`, since this context is inert in OSS and would answer
// `false` there.

export const StorageSetupContext =
  createContext<StorageSetupContextValue | null>(null);

export interface StorageSetupProviderProps {
  children: ReactNode;
  /**
   * Pass `false` while the hosting UI is hidden to skip the add-ons Store
   * round-trip. Purchase state and its polling keep running regardless.
   */
  enabled?: boolean;
}

const INERT_STORAGE_SETUP_VALUE: StorageSetupContextValue = {
  isSettingUp: false,
  hasSetupFailed: false,
  storageAddOn: undefined,
  isLoadingStorageAddOn: false,
  isPurchaseModalOpened: false,
  openPurchaseModal: () => {},
  canPurchaseStorage: false,
};

export const StorageSetupProvider = ({
  children,
}: StorageSetupProviderProps) => (
  <StorageSetupContext.Provider value={INERT_STORAGE_SETUP_VALUE}>
    {children}
  </StorageSetupContext.Provider>
);

export const useStorageSetup = (): StorageSetupContextValue => {
  const context = useContext(StorageSetupContext);

  if (!context) {
    throw new Error(
      "useStorageSetup must be used within a StorageSetupProvider",
    );
  }

  return context;
};
