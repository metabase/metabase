import React from "react";
import { t } from "ttag";
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
}

const CollectionMenu = ({
  collection,
  isAdmin,
  isPersonalCollectionChild,
}: CollectionMenuProps): JSX.Element | null => {
  const items = [];
  const url = Urls.collection(collection);
  const isRoot = isRootCollection(collection);
  const isPersonal = isPersonalCollection(collection);

  if (!isRoot) {
    items.push({
      title: t`Archive`,
      icon: "view_archive",
      link: `${url}/archive`,
      event: `${ANALYTICS_CONTEXT};Menu;Archive Collection`,
    });
    items.push({
      title: t`Move`,
      icon: "move",
      link: `${url}/move`,
      event: `${ANALYTICS_CONTEXT};Menu;Move Collection`,
    });
  }

  if (isAdmin && !isPersonal && !isPersonalCollectionChild) {
    items.push({
      title: t`Edit permissions`,
      icon: "lock",
      link: `${url}/permissions`,
      event: `${ANALYTICS_CONTEXT};Menu;Edit Permissions`,
    });
  }

  if (items.length > 0) {
    return <EntityMenu items={items} triggerIcon="ellipsis" />;
  } else {
    return null;
  }
};

export default CollectionMenu;
