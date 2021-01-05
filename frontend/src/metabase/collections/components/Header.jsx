import React from "react";
import { Flex } from "grid-styled";

import { t } from "ttag";
import cx from "classnames";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import PageHeading from "metabase/components/type/PageHeading";
import Tooltip from "metabase/components/Tooltip";
import CollectionEditMenu from "metabase/collections/components/CollectionEditMenu";

export default function Header({
  showFilters,
  collectionHasPins,
  unpinnedItems,
  collection,
  isAdmin,
  isRoot,
  collectionId,
}) {
  return (
    <Flex
      align="center"
      py={3}
      className={cx({
        "border-bottom":
          !showFilters && !collectionHasPins && unpinnedItems.length > 0,
      })}
    >
      <Flex align="center">
        <PageHeading className="text-wrap">{collection.name}</PageHeading>
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

      <Flex ml="auto">
        {isAdmin && !collection.personal_owner_id && (
          <Tooltip tooltip={t`Edit the permissions for this collection`}>
            <Link to={Urls.collectionPermissions(collectionId)}>
              <IconWrapper>
                <Icon name="lock" />
              </IconWrapper>
            </Link>
          </Tooltip>
        )}
        {collection &&
          collection.can_write &&
          !collection.personal_owner_id && (
            <CollectionEditMenu
              tooltip={t`Edit collection`}
              collectionId={collectionId}
              isAdmin={isAdmin}
              isRoot={isRoot}
            />
          )}
        {collection && collection.can_write && (
          <Tooltip tooltip={t`New collection`}>
            <Link to={Urls.newCollection(collectionId)}>
              <IconWrapper>
                <Icon name="new_folder" />
              </IconWrapper>
            </Link>
          </Tooltip>
        )}
      </Flex>
    </Flex>
  );
}
