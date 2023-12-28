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

export interface AppState {
  errorPage: AppErrorDescriptor | null;
  isNavbarOpen: boolean;
}
