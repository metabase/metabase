import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { ICloudAddOnProduct } from "metabase-types/api";

export interface StorageSetupContextValue {
  isSettingUp: boolean;
  storageAddOn: ICloudAddOnProduct | undefined;
  isLoadingStorageAddOn: boolean;
  isPurchaseModalOpened: boolean;
  openPurchaseModal: () => void;
  hasAttachedDwh: boolean;
  canSetUpStorage: boolean;
}

export const StorageSetupContext =
  createContext<StorageSetupContextValue | null>(null);

export interface StorageSetupProviderProps {
  children: ReactNode;
  /**
   * Pass `false` while the hosting UI is hidden to avoid fetching the add-ons
   * list (a Store API round-trip) eagerly. Purchase/setup state and its
   * polling keep running regardless.
   */
  enabled?: boolean;
}

const INERT_STORAGE_SETUP_VALUE: StorageSetupContextValue = {
  isSettingUp: false,
  storageAddOn: undefined,
  isLoadingStorageAddOn: false,
  isPurchaseModalOpened: false,
  openPurchaseModal: () => {},
  hasAttachedDwh: false,
  canSetUpStorage: false,
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
