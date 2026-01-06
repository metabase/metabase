import { Fragment } from "react";
import { t } from "ttag";

import { Badge } from "metabase/common/components/Badge";
import { useToggle } from "metabase/common/hooks/use-toggle";
import * as Urls from "metabase/lib/urls";
import { CollectionBadge } from "metabase/questions/components/CollectionBadge";
import { ActionIcon, Icon } from "metabase/ui";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
  Dashboard,
} from "metabase-types/api";

import {
  BreadcrumbsPathSeparator,
  PathContainer,
} from "./CollectionBreadcrumbs.styled";
import { getCollectionList } from "./utils";

export interface CollectionBreadcrumbsProps {
  collection?: Collection;
  dashboard?: Dashboard;
  onClick?: (collection: CollectionEssentials) => void;
  baseCollectionId: CollectionId | null;
}

export const CollectionBreadcrumbs = ({
  collection,
  dashboard,
  onClick,
  baseCollectionId = null,
}: CollectionBreadcrumbsProps): JSX.Element | null => {
  const [isExpanded, { toggle }] = useToggle(false);

  if (!collection) {
    return null;
  }

  const parts = getCollectionList({
    baseCollectionId,
    collection,
  });

  const separator = <BreadcrumbsPathSeparator>/</BreadcrumbsPathSeparator>;

  const content =
    parts.length > 1 && !isExpanded ? (
      <>
        <CollectionBadge
          collectionId={parts[0].id}
          isSingleLine
          onClick={onClick ? () => onClick(collection) : undefined}
        />
        {separator}
        <ActionIcon
          onClick={toggle}
          aria-label={isExpanded ? t`Collapse` : t`Expand`}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
        {separator}
      </>
    ) : (
      parts.map((collection) => (
        <Fragment key={collection.id}>
          <CollectionBadge
            collectionId={collection.id}
            isSingleLine
            onClick={onClick ? () => onClick(collection) : undefined}
          />
          {separator}
        </Fragment>
      ))
    );

  return (
    <>
      <PathContainer>
        {content}
        <CollectionBadge
          collectionId={collection.id}
          isSingleLine
          onClick={onClick ? () => onClick(collection) : undefined}
        />
      </PathContainer>
      {dashboard && (
        <>
          {separator}
          <Badge
            icon={{ name: "dashboard" }}
            inactiveColor="text-tertiary"
            isSingleLine
            to={Urls.dashboard(dashboard)}
          >
            {dashboard.name}
          </Badge>
        </>
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
