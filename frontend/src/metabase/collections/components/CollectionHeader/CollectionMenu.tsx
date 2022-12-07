import React from "react";
import { t } from "ttag";
import _ from "underscore";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import EntityMenu from "metabase/components/EntityMenu";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import {
  isPersonalCollection,
  isRootCollection,
} from "metabase/collections/utils";
import { Collection } from "metabase-types/api";

export interface CollectionMenuProps {
  collection: Collection;
  isAdmin: boolean;
  isPersonalCollectionChild: boolean;
  isDataApp: boolean;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}

const CollectionMenu = ({
  collection,
  isAdmin,
  isPersonalCollectionChild,
  isDataApp,
  onUpdateCollection,
}: CollectionMenuProps): JSX.Element | null => {
  const items = [];
  const url = isDataApp
    ? Urls.collection(_.omit(collection, "app_id"))
    : Urls.collection(collection);
  const isRoot = isRootCollection(collection);
  const isPersonal = isPersonalCollection(collection);
  const canWrite = collection.can_write;

  if (isAdmin && !isRoot && !isPersonal && !isPersonalCollectionChild) {
    items.push(
      ...PLUGIN_COLLECTIONS.getAuthorityLevelMenuItems(
        collection,
        onUpdateCollection,
      ),
    );
  }

  if (isAdmin && !isPersonal && !isPersonalCollectionChild && !isDataApp) {
    items.push({
      title: t`Edit permissions`,
      icon: "lock",
      link: `${url}/permissions`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Edit Permissions`,
    });
  }

  if (!isRoot && !isPersonal && canWrite) {
    if (!isDataApp) {
      items.push({
        title: t`Move`,
        icon: "move",
        link: `${url}/move`,
        event: `${ANALYTICS_CONTEXT};Edit Menu;Move Collection`,
      });
    }
    items.push({
      title: t`Archive`,
      icon: "archive",
      link: `${url}/archive`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Archive Collection`,
    });
  }

  if (items.length > 0) {
    return (
      <EntityMenu
        items={items}
        triggerIcon="ellipsis"
        tooltip={t`Move, archive, and more...`}
      />
    );
  } else {
    return null;
  }
};

export default CollectionMenu;
