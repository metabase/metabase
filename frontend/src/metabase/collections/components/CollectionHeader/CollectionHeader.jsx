/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { isPersonalCollection } from "metabase/collections/utils";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import PageHeading from "metabase/components/type/PageHeading";
import Tooltip from "metabase/components/Tooltip";

import CollectionEditMenu from "metabase/collections/components/CollectionEditMenu";
import NewCollectionItemMenu from "metabase/collections/components/NewCollectionItemMenu";

import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";

import {
  Container,
  DescriptionHeading,
  MenuContainer,
  TitleContent,
  ToggleMobileSidebarIcon,
} from "./CollectionHeader.styled";

function Title({ collection, handleToggleMobileSidebar }) {
  return (
    <div>
      <TitleContent>
        <ToggleMobileSidebarIcon onClick={handleToggleMobileSidebar} />
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

function Menu(props) {
  const { hasWritePermission } = props;
  return (
    <MenuContainer data-testid="collection-menu">
      {hasWritePermission && <NewCollectionItemMenu {...props} />}
      <EditMenu {...props} />
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
