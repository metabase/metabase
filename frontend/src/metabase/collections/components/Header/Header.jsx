/* eslint-disable react/prop-types */
import React from "react";
import { Flex } from "grid-styled";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import PageHeading from "metabase/components/type/PageHeading";
import Tooltip from "metabase/components/Tooltip";
import CollectionEditMenu from "metabase/collections/components/CollectionEditMenu";

import { ToggleMobileSidebarIcon } from "./Header.styled";

function Title({ collection, handleToggleMobileSidebar }) {
  return (
    <Flex align="center">
      <PageHeading className="text-wrap">
        <ToggleMobileSidebarIcon onClick={handleToggleMobileSidebar} />
        {collection.name}
      </PageHeading>

      {collection.description && (
        <Tooltip tooltip={collection.description}>
          <Icon
            name="info"
            ml={1}
            mt="4px"
            color={color("bg-dark")}
            hover={{ color: color("brand") }}
          />
        </Tooltip>
      )}
    </Flex>
  );
}

function Menu({
  collection,
  collectionId,
  isAdmin,
  isPersonalCollectionChild,
  isRoot,
}) {
  const shouldRenderLinkToEditPermissions =
    isAdmin && !collection.personal_owner_id && !isPersonalCollectionChild;

  const shouldRenderEditMenu =
    collection && collection.can_write && !collection.personal_owner_id;

  const shouldRenderLinkToCreateCollection = collection && collection.can_write;

  return (
    <Flex ml="auto">
      {shouldRenderLinkToEditPermissions && (
        <Tooltip tooltip={t`Edit the permissions for this collection`}>
          <Link to={`${Urls.collection(collection)}/permissions`}>
            <IconWrapper>
              <Icon name="lock" />
            </IconWrapper>
          </Link>
        </Tooltip>
      )}

      {shouldRenderEditMenu && (
        <CollectionEditMenu
          tooltip={t`Edit collection`}
          collection={collection}
          isAdmin={isAdmin}
          isRoot={isRoot}
        />
      )}

      {shouldRenderLinkToCreateCollection && (
        <Tooltip tooltip={t`New collection`}>
          <Link to={Urls.newCollection(collectionId)}>
            <IconWrapper>
              <Icon name="new_folder" />
            </IconWrapper>
          </Link>
        </Tooltip>
      )}
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
