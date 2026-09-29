import type {
  NavSection,
  OpenNavItem,
} from "metabase/nav/containers/MainNavbar/types";
import type { CollectionId } from "metabase-types/api/collection";

export type ChecklistItemValue =
  | "database"
  | "invite"
  | "ai"
  | "query"
  | "dashboard"
  | "alert"
  | "data-studio"
  | "permissions";

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

/**
 * The collection the current page lives in, published by the page itself so
 * the app header can render its breadcrumbs. `collectionId: null` is the root
 * collection.
 */
export interface PageCollection {
  collectionId: CollectionId | null;
}

/**
 * How the current page frames its content, so the app header above it can match:
 * the same background (instead of a lighter strip across the top) and the same
 * horizontal gutter (so the breadcrumbs line up with the page's edges).
 */
export interface PageFrame {
  background: "primary" | "secondary";
  /** Horizontal padding, as a Mantine spacing value or CSS length. */
  gutter: string;
}

export interface AppState {
  /** `null` when no page has claimed a collection. */
  pageCollection: PageCollection | null;
  /** `null` when the page uses the default frame. */
  pageFrame: PageFrame | null;
  errorPage: AppErrorDescriptor | null;
  navSection: NavSection | null;
  /** The section of whatever is currently open, used when the user has not chosen one. */
  navSectionSeed: NavSection | null;
  openNavItems: OpenNavItem[];
  isDndAvailable: boolean;
  isErrorDiagnosticsOpen: boolean;
  tempStorage: TempStorage;
}
