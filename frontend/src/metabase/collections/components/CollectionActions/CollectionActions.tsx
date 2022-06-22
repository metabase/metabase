import React, { useCallback, useState } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Tooltip from "metabase/components/Tooltip";
import EntityMenu from "metabase/components/EntityMenu";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import {
  isPersonalCollection,
  isRootCollection,
} from "metabase/collections/utils";
import { Collection } from "metabase-types/api";
import { BookmarkIcon, BookmarkIconWrapper } from "./CollectionActions.styled";

interface CollectionActionsProps {
  collection: Collection;
  isAdmin: boolean;
  isBookmarked: boolean;
  isPersonalCollectionChild: boolean;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
}

const CollectionActions = ({
  collection,
  isAdmin,
  isBookmarked,
  isPersonalCollectionChild,
  onCreateBookmark,
  onDeleteBookmark,
}: CollectionActionsProps): JSX.Element => {
  const isRoot = isRootCollection(collection);
  const isPersonal = isPersonalCollection(collection);

  return (
    <div>
      {!isRoot && (
        <CollectionBookmark
          collection={collection}
          isBookmarked={isBookmarked}
          onCreateBookmark={onCreateBookmark}
          onDeleteBookmark={onDeleteBookmark}
        />
      )}
      <CollectionMenu
        collection={collection}
        isAdmin={isAdmin}
        isRoot={isRoot}
        isPersonal={isPersonal}
        isPersonalCollectionChild={isPersonalCollectionChild}
      />
    </div>
  );
};

interface CollectionBookmarkProps {
  collection: Collection;
  isBookmarked: boolean;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
}

const CollectionBookmark = ({
  collection,
  isBookmarked,
  onCreateBookmark,
  onDeleteBookmark,
}: CollectionBookmarkProps): JSX.Element => {
  const [isChanged, setIsChanged] = useState(false);

  const handleClick = useCallback(() => {
    if (isBookmarked) {
      onDeleteBookmark(collection);
    } else {
      onCreateBookmark(collection);
    }

    setIsChanged(true);
  }, [collection, isBookmarked, onCreateBookmark, onDeleteBookmark]);

  return (
    <Tooltip tooltip={isBookmarked ? t`Remove from bookmarks` : t`Bookmark`}>
      <BookmarkIconWrapper isBookmarked={isBookmarked} onClick={handleClick}>
        <BookmarkIcon
          name="bookmark"
          isBookmarked={isBookmarked}
          isChanged={isChanged}
        />
      </BookmarkIconWrapper>
    </Tooltip>
  );
};

interface CollectionMenuProps {
  collection: Collection;
  isAdmin: boolean;
  isRoot: boolean;
  isPersonal: boolean;
  isPersonalCollectionChild: boolean;
}

const CollectionMenu = ({
  collection,
  isAdmin,
  isRoot,
  isPersonal,
  isPersonalCollectionChild,
}: CollectionMenuProps): JSX.Element | null => {
  const items = [];
  const url = Urls.collection(collection);

  if (!isRoot) {
    items.push({
      title: t`Archive`,
      icon: "view_archive",
      link: `${url}/archive`,
      event: `${ANALYTICS_CONTEXT};Menu;Archive Collection`,
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

  return items.length > 0 ? (
    <EntityMenu items={items} triggerIcon="ellipsis" />
  ) : null;
};

export default CollectionActions;
