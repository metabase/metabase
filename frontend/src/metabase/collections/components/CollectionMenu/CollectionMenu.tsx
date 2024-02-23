import { t } from "ttag";

import {
  isInstanceAnalyticsCustomCollection,
  isRootPersonalCollection,
  isRootCollection,
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
  const items = [];
  const url = Urls.collection(collection);
  const isRoot = isRootCollection(collection);
  const isPersonal = isRootPersonalCollection(collection);
  const isInstanceAnalyticsCustom =
    isInstanceAnalyticsCustomCollection(collection);
  const canWrite = collection.can_write;

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

  if (!isRoot && !isPersonal && canWrite && !isInstanceAnalyticsCustom) {
    items.push({
      title: t`Move`,
      icon: "move",
      link: `${url}/move`,
    });
    items.push({
      title: t`Archive`,
      icon: "archive",
      link: `${url}/archive`,
    });
  }

  if (items.length > 0) {
    return (
      <EntityMenu
        items={items}
        triggerIcon="ellipsis"
        tooltip={t`Move, archive, and more...`}
        tooltipPlacement="bottom"
      />
    );
  } else {
    return null;
  }
};
