import type { SdkBreadcrumbItem } from "embedding-sdk-bundle/types/breadcrumb";

export function updateBreadcrumbsWithItem(
  breadcrumbs: SdkBreadcrumbItem[],
  nextItem: SdkBreadcrumbItem,
): SdkBreadcrumbItem[] {
  if (breadcrumbs.length === 0) {
    return [nextItem];
  }

  const lastItem = breadcrumbs[breadcrumbs.length - 1];

  // When navigating to a dashboard card, do not show in breadcrumbs
  // for consistency with ad-hoc questions.
  if (lastItem.type === "dashboard" && nextItem.type === "question") {
    return breadcrumbs;
  }

  if (nextItem.type === "collection") {
    return (
      removeBreadcrumbsAfterItem(breadcrumbs, nextItem) ?? [
        ...breadcrumbs,
        nextItem,
      ]
    );
  }

  // If a dashboard or question already exist as the last item, replace it.
  if (lastItem.type === nextItem.type) {
    return [...breadcrumbs.slice(0, -1), nextItem];
  }

  return [...breadcrumbs, nextItem];
}

export function removeBreadcrumbsAfterItem(
  breadcrumbs: SdkBreadcrumbItem[],
  nextItem: SdkBreadcrumbItem,
): SdkBreadcrumbItem[] | null {
  const existingIndex = breadcrumbs.findIndex(
    (item) => item.id === nextItem.id && item.type === nextItem.type,
  );

  if (existingIndex === -1) {
    return null;
  }

  return breadcrumbs.slice(0, existingIndex + 1);
}
