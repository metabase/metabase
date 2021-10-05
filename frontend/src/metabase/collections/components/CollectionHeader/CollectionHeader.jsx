/* eslint-disable react/prop-types */
import React from "react";
import { Flex } from "grid-styled";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { isPersonalCollection } from "metabase/collections/utils";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import PageHeading from "metabase/components/type/PageHeading";
import Tooltip from "metabase/components/Tooltip";
import CollectionEditMenu from "metabase/collections/components/CollectionEditMenu";

import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";

import {
  Container,
  DescriptionTooltipIcon,
  MenuContainer,
  ToggleMobileSidebarIcon,
} from "./CollectionHeader.styled";

function Title({ collection, handleToggleMobileSidebar }) {
  return (
    <Flex align="center">
      <ToggleMobileSidebarIcon onClick={handleToggleMobileSidebar} />
      <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
        collection={collection}
        mr={1}
        size={24}
      />
      <PageHeading className="text-wrap">{collection.name}</PageHeading>
      {collection.description && (
        <Tooltip tooltip={collection.description}>
          <DescriptionTooltipIcon />
        </Tooltip>
      )}
    </Flex>
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

function CreateCollectionLink({
  collection,
  collectionId,
  hasWritePermission,
}) {
  const tooltip = t`New collection`;
  const link = Urls.newCollection(collectionId);

  return hasWritePermission ? (
    <Tooltip tooltip={tooltip}>
      <Link to={link}>
        <IconWrapper>
          <Icon name="new_folder" />
        </IconWrapper>
      </Link>
    </Tooltip>
  ) : null;
}

function Menu(props) {
  return (
    <MenuContainer>
      <EditMenu {...props} />
      <CreateCollectionLink {...props} />
      <PermissionsLink {...props} />
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
