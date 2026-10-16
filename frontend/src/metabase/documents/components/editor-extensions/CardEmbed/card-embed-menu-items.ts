import { isNotFalsy } from "metabase/utils/types";

export type CardEmbedMenuItemId =
  | "comment"
  | "add-supporting-text"
  | "edit-visualization"
  | "edit-timeline-events"
  | "edit-query"
  | "replace"
  | "download"
  | "remove";

export type CardEmbedMenuItem = {
  id: CardEmbedMenuItemId;
  isEnabled: boolean;
};

type CardEmbedMenuItemsOptions = {
  canEdit: boolean;
  canWrite: boolean;
  canOpenComments: boolean;
  canAddSupportingText: boolean;
  canDownloadResults: boolean;
  hasTimelineEvents: boolean;
  isStatic: boolean;
  isInIframe: boolean;
};

/**
 * A card embed's menu items, in display order. An editor shows the items the
 * user cannot use as disabled; a surface that cannot edit leaves them out.
 */
export function getCardEmbedMenuItems({
  canEdit,
  canWrite,
  canOpenComments,
  canAddSupportingText,
  canDownloadResults,
  hasTimelineEvents,
  isStatic,
  isInIframe,
}: CardEmbedMenuItemsOptions): CardEmbedMenuItem[] {
  const items: (CardEmbedMenuItem | false)[] = [
    canWrite && !isInIframe && { id: "comment", isEnabled: canOpenComments },
    {
      id: "add-supporting-text",
      isEnabled: canWrite && canAddSupportingText,
    },
    { id: "edit-visualization", isEnabled: canWrite },
    hasTimelineEvents && { id: "edit-timeline-events", isEnabled: canWrite },
    !isStatic && { id: "edit-query", isEnabled: canWrite },
    !isStatic && { id: "replace", isEnabled: canWrite },
    !isStatic && canDownloadResults && { id: "download", isEnabled: true },
    { id: "remove", isEnabled: canWrite },
  ];
  const shownItems = items.filter(isNotFalsy);

  return canEdit ? shownItems : shownItems.filter((item) => item.isEnabled);
}
