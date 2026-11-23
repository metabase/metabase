import { t } from "ttag";

import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import { useSyncedCollectionIds } from "metabase/nav/prototype/use-synced-collection-ids";
import { useSetting } from "metabase/settings";
import type { CollectionItemModel } from "metabase-types/api";

import type { OmniPickerCollectionItem, OmniPickerItem } from "../types";

/** PROTOTYPE: virtual root folder listing the collections synced from git. */
export const SYNCED_CONTENT_ID = "synced-content";

/** The root collection ("Our analytics", shown as "Saved"). */
export function isRootCollectionItem(item: OmniPickerItem): boolean {
  return (
    item.model === "collection" &&
    item.id === "root" &&
    !("namespace" in item && item.namespace)
  );
}

/** The "Official collections" root folder: the root's synced collections. */
export function getSyncedContentItem(
  below: CollectionItemModel[],
): OmniPickerCollectionItem {
  return {
    id: SYNCED_CONTENT_ID,
    name: t`Official collections`,
    model: "collection",
    namespace: null,
    can_write: false,
    location: "/",
    sourceCollectionId: "root",
    here: ["collection"],
    below,
  };
}

// Models a picker can put things into rather than pick to use.
const DESTINATION_MODELS: readonly string[] = [
  "collection",
  "dashboard",
  "document",
];

/**
 * PROTOTYPE: with git integration on, synced collections are a separate tree
 * from the other collections. As a save/move destination, "Official
 * collections" is only offered when the instance can push to git
 * (read-write); pickers that pick things to use (e.g. a question's starting
 * data) always offer it.
 */
export function useSyncedContent({
  models = [],
}: { models?: readonly string[] } = {}) {
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const isReadWrite = useSetting("remote-sync-type") !== "read-only";
  const isDestinationPicker =
    models.length > 0 &&
    models.every((model) => DESTINATION_MODELS.includes(model));
  const syncedCollectionIds = useSyncedCollectionIds({
    skip: !isGitIntegrationEnabled,
  });

  const isSyncedCollection = (item: {
    id: unknown;
    model: string;
    is_remote_synced?: boolean;
  }) =>
    item.model === "collection" &&
    (item.is_remote_synced === true ||
      (typeof item.id === "number" && syncedCollectionIds.has(item.id)));

  return {
    isGitIntegrationEnabled,
    showSyncedContent:
      isGitIntegrationEnabled && (isReadWrite || !isDestinationPicker),
    isSyncedCollection,
  };
}
