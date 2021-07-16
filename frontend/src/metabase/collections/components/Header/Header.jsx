/* eslint-disable react/prop-types */
import React from "react";
import { Flex } from "grid-styled";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import PageHeading from "metabase/components/type/PageHeading";
import Tooltip from "metabase/components/Tooltip";
import CollectionEditMenu from "metabase/collections/components/CollectionEditMenu";

import {
  DescriptionTooltipIcon,
  ToggleMobileSidebarIcon,
} from "./Header.styled";

function Title({
  collection: { description, name },
  handleToggleMobileSidebar,
}) {
  return (
    <Flex align="center">
      <PageHeading className="text-wrap">
        <ToggleMobileSidebarIcon onClick={handleToggleMobileSidebar} />
        {name}
      </PageHeading>

      {description && (
        <Tooltip tooltip={description}>
          <DescriptionTooltipIcon />
        </Tooltip>
      )}
    </Flex>
  );
}

function PermissionsLink({ collection, isAdmin, isPersonalCollectionChild }) {
  const shouldRender =
    isAdmin && !collection.personal_owner_id && !isPersonalCollectionChild;

  const tooltip = t`Edit the permissions for this collection`;
  const link = `${Urls.collection(collection)}/permissions`;

  return shouldRender ? (
    <Tooltip tooltip={tooltip}>
      <Link to={link}>
        <IconWrapper>
          <Icon name="lock" />
        </IconWrapper>
      </Link>
    </Tooltip>
  ) : null;
}

function EditMenu({ collection, isAdmin, isRoot }) {
  const shouldRender =
    collection && collection.can_write && !collection.personal_owner_id;

  const tooltip = t`Edit collection`;

  return shouldRender ? (
    <CollectionEditMenu
      tooltip={tooltip}
      collection={collection}
      isAdmin={isAdmin}
      isRoot={isRoot}
    />
  ) : null;
}

function CreateCollectionLink({ collection, collectionId }) {
  const shouldRender = collection && collection.can_write;

  const tooltip = t`New collection`;
  const link = Urls.newCollection(collectionId);

  return shouldRender ? (
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
    <Flex ml="auto">
      <PermissionsLink {...props} />
      <EditMenu {...props} />
      <CreateCollectionLink {...props} />
    </Flex>
  );
}

export default function Header(props) {
  return (
    <Flex align="center" py={3}>
      <Title {...props} />
      <Menu {...props} />
    </Flex>
  );
}
