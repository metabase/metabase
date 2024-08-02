import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";
import {
  isInstanceAnalyticsCustomCollection,
  isRootPersonalCollection,
  isRootCollection,
  isTrashedCollection,
} from "metabase/collections/utils";
import EntityMenu from "metabase/components/EntityMenu";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import type { Collection } from "metabase-types/api";

export interface CollectionMenuProps {
  collection: Collection;
  isAdmin: boolean;
  isPersonalCollectionChild: boolean;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}

export const CollectionMenu = ({
  collection,
  isAdmin,
  isPersonalCollectionChild,
  onUpdateCollection,
}: CollectionMenuProps): JSX.Element | null => {
  // only get the count of items in the collection if we need it
  const maybeCollectionItemCount =
    useListCollectionItemsQuery(
      {
        id: collection.id,
        limit: 0, // we don't want any of the items, we just want to know how many there are in the collection
      },
      {
        skip: !PLUGIN_COLLECTIONS.canCleanUp,
      },
    ).data?.total ?? 0;

  const items = [];
  const url = Urls.collection(collection);
  const isRoot = isRootCollection(collection);
  const isPersonal = isRootPersonalCollection(collection);
  const isInstanceAnalyticsCustom =
    isInstanceAnalyticsCustomCollection(collection);
  const isTrashed = isTrashedCollection(collection);

  const canWrite = collection.can_write;
  const canMove =
    !isRoot && !isPersonal && canWrite && !isInstanceAnalyticsCustom;

  if (isAdmin && !isRoot && canWrite) {
    items.push(
      ...PLUGIN_COLLECTIONS.getAuthorityLevelMenuItems(
        collection,
        onUpdateCollection,
      ),
    );
  }

  if (isAdmin && !isPersonal && !isPersonalCollectionChild) {
    items.push({
      title: t`Edit permissions`,
      icon: "lock",
      link: `${url}/permissions`,
    });
  }

  if (canMove) {
    items.push({
      title: t`Move`,
      icon: "move",
      link: `${url}/move`,
    });
  }

  items.push(
    ...PLUGIN_COLLECTIONS.getCleanUpMenuItems(
      maybeCollectionItemCount,
      url,
      isInstanceAnalyticsCustom,
      isTrashed,
      canWrite,
    ),
  );

  if (canMove) {
    items.push({
      title: t`Move to trash`,
      icon: "trash",
      link: `${url}/archive`,
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <EntityMenu
      items={items}
      triggerIcon="ellipsis"
      tooltip={t`Move, trash, and more...`}
      tooltipPlacement="bottom"
    />
  );
};
