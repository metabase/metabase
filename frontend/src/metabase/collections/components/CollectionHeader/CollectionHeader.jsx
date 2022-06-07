/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { isPersonalCollection } from "metabase/collections/utils";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import PageHeading from "metabase/components/type/PageHeading";
import Tooltip from "metabase/components/Tooltip";

import CollectionEditMenu from "metabase/collections/components/CollectionEditMenu";
import NewCollectionItemMenu from "metabase/collections/components/NewCollectionItemMenu";
import { color } from "metabase/lib/colors";

import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";

import {
  BookmarkIcon,
  BookmarkIconWrapper,
  Container,
  DescriptionHeading,
  MenuContainer,
  TitleContent,
} from "./CollectionHeader.styled";

function Title({ collection }) {
  return (
    <div>
      <TitleContent>
        <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
          collection={collection}
          mr={1}
          size={24}
        />
        <PageHeading
          data-testid="collection-name-heading"
          className="text-wrap"
        >
          {collection.name}
        </PageHeading>
      </TitleContent>
      {collection.description && (
        <DescriptionHeading>{collection.description}</DescriptionHeading>
      )}
    </div>
  );
}

function PermissionsLink({
  collection,
  isAdmin,
  isPersonal,
  isPersonalCollectionChild,
}) {
  const tooltip = t`Edit the permissions for this collection`;
  const link = `${Urls.collection(collection)}/permissions`;

  const canChangePermissions =
    isAdmin && !isPersonal && !isPersonalCollectionChild;

  return canChangePermissions ? (
    <Tooltip tooltip={tooltip}>
      <Link to={link}>
        <IconWrapper>
          <Icon name="lock" />
        </IconWrapper>
      </Link>
    </Tooltip>
  ) : null;
}

function TimelinesLink({ collection }) {
  const title = t`Events`;
  const link = Urls.timelinesInCollection(collection);

  return (
    <Tooltip tooltip={title}>
      <Link to={link}>
        <IconWrapper>
          <Icon name="calendar" size={20} />
        </IconWrapper>
      </Link>
    </Tooltip>
  );
}

function EditMenu({
  collection,
  hasWritePermission,
  isAdmin,
  isPersonal,
  isRoot,
}) {
  const tooltip = t`Edit collection`;

  const canEditCollection = hasWritePermission && !isPersonal;

  return canEditCollection ? (
    <CollectionEditMenu
      tooltip={tooltip}
      collection={collection}
      isAdmin={isAdmin}
      isRoot={isRoot}
    />
  ) : null;
}

function Bookmark({ isBookmarked, onClickBookmark }) {
  const title = isBookmarked ? t`Remove from bookmarks` : t`Bookmark`;
  const iconColor = isBookmarked ? color("brand") : "";
  const [animation, setAnimation] = useState(null);

  const handleClickBookmark = () => {
    onClickBookmark();
    setAnimation(isBookmarked ? "shrink" : "expand");
  };

  return (
    <Tooltip tooltip={title}>
      <BookmarkIconWrapper
        isBookmarked={isBookmarked}
        onClick={handleClickBookmark}
      >
        <BookmarkIcon
          name="bookmark"
          color={iconColor}
          size={20}
          animation={animation}
        />
      </BookmarkIconWrapper>
    </Tooltip>
  );
}

function Menu(props) {
  const { collectionId, hasWritePermission } = props;

  const shouldBeBookmarkable = collectionId !== "root";

  return (
    <MenuContainer data-testid="collection-menu">
      {hasWritePermission && <NewCollectionItemMenu {...props} />}
      <EditMenu {...props} />
      <PermissionsLink {...props} />
      <TimelinesLink {...props} />
      {shouldBeBookmarkable && <Bookmark {...props} />}
    </MenuContainer>
  );
}

export default function CollectionHeader(props) {
  const { collection } = props;
  const isPersonal = isPersonalCollection(collection);
  const hasWritePermission = collection && collection.can_write;

  return (
    <Container>
      <Title {...props} />
      <Menu
        {...props}
        isPersonal={isPersonal}
        hasWritePermission={hasWritePermission}
      />
    </Container>
  );
}
