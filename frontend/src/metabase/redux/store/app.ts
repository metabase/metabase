import type { ChecklistItemValue } from "metabase/home/components/Onboarding/types";
import type { Table } from "metabase-types/api";
import type { CollectionId } from "metabase-types/api/collection";

export interface AppErrorDescriptor {
  status: number;
  data?: {
    error_code: string;
    message?: string;
  };
  context?: string;
}

export interface AppBreadCrumbs {
  collectionId: CollectionId;
  show: boolean;
}

/**
 * Storage for non-critical, ephemeral user preferences.
 * Think of it as a sessionStorage alternative implemented in Redux.
 * Only specific key/value pairs can be stored here,
 * and then later used with the `use-temp-storage` hook.
 */
export type TempStorage = {
  "last-opened-onboarding-checklist-item": ChecklistItemValue | undefined;
};

export type TempStorageKey = keyof TempStorage;
export type TempStorageValue<Key extends TempStorageKey = TempStorageKey> =
  TempStorage[Key];

export interface DetailViewState {
  rowName: string;
  table: Table;
  collectionId: CollectionId | null;
}

export interface AppState {
  detailView: DetailViewState | null;
  errorPage: AppErrorDescriptor | null;
  isNavbarOpen: boolean;
  isDndAvailable: boolean;
  isErrorDiagnosticsOpen: boolean;
  tempStorage: TempStorage;
}
