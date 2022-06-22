import React, { useCallback, useState } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link/Link";
import Icon, { IconWrapper } from "metabase/components/Icon";
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
      <CollectionBookmarkToggle
        collection={collection}
        isRoot={isRoot}
        isBookmarked={isBookmarked}
        onCreateBookmark={onCreateBookmark}
        onDeleteBookmark={onDeleteBookmark}
      />
      <CollectionTimelinesLink collection={collection} />
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

interface CollectionBookmarkToggleProps {
  collection: Collection;
  isRoot: boolean;
  isBookmarked: boolean;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
}

const CollectionBookmarkToggle = ({
  collection,
  isRoot,
  isBookmarked,
  onCreateBookmark,
  onDeleteBookmark,
}: CollectionBookmarkToggleProps): JSX.Element | null => {
  const [isChanged, setIsChanged] = useState(false);

  const handleClick = useCallback(() => {
    if (isBookmarked) {
      onDeleteBookmark(collection);
    } else {
      onCreateBookmark(collection);
    }

    setIsChanged(true);
  }, [collection, isBookmarked, onCreateBookmark, onDeleteBookmark]);

  if (isRoot) {
    return null;
  }

  return (
    <Tooltip tooltip={isBookmarked ? t`Remove from bookmarks` : t`Bookmark`}>
      <BookmarkIconWrapper isBookmarked={isBookmarked} onClick={handleClick}>
        <BookmarkIcon
          name="bookmark"
          size={20}
          isBookmarked={isBookmarked}
          isChanged={isChanged}
        />
      </BookmarkIconWrapper>
    </Tooltip>
  );
};

interface CollectionTimelinesLinkProps {
  collection: Collection;
}

const CollectionTimelinesLink = ({
  collection,
}: CollectionTimelinesLinkProps): JSX.Element => {
  const url = Urls.timelinesInCollection(collection);

  return (
    <Tooltip tooltip={t`Events`}>
      <Link to={url}>
        <IconWrapper>
          <Icon name="calendar" size={20} />
        </IconWrapper>
      </Link>
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

export default CollectionActions;
