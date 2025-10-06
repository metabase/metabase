import type { SdkCollectionId } from "./collection";

export type SdkBreadcrumbItemType =
  | "collection"
  | "dashboard"
  | "question"
  | "model"
  | "metric";

export interface SdkBreadcrumbItem {
  id: number | string | SdkCollectionId;
  name: string;
  type: SdkBreadcrumbItemType;

  /**
   * Optional callback to execute when navigating to this breadcrumb item.
   * Used for implementing "Return to" and "Back" behaviors.
   */
  onNavigate?: () => void;
}

export interface SdkBreadcrumbsContextType {
  breadcrumbs: SdkBreadcrumbItem[];

  /**
   * Whether breadcrumbs should be used.
   * This is only true when the SDK components are wrapped with BreadcrumbProvider.
   **/
  isBreadcrumbEnabled: boolean;

  /**
   * The latest breadcrumb item user clicked to navigate to.
   *
   * CollectionBrowser should watch this to handle navigation.
   */
  currentLocation: SdkBreadcrumbItem | null;

  /**
   * Trigger navigation to a specific breadcrumb item.
   */
  navigateTo: (item: SdkBreadcrumbItem) => void;

  /**
   * Report current location to the breadcrumb stack.
   */
  reportLocation: (item: SdkBreadcrumbItem) => void;
}
