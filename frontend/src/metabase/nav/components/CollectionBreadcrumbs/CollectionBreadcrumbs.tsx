import { Fragment } from "react";

import { Badge } from "metabase/components/Badge";
import { useToggle } from "metabase/hooks/use-toggle";
import * as Urls from "metabase/lib/urls";
import { CollectionBadge } from "metabase/questions/components/CollectionBadge";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
  Dashboard,
} from "metabase-types/api";

import {
  BreadcrumbsPathSeparator,
  ExpandButton,
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
        <ExpandButton
          small
          borderless
          icon="ellipsis"
          onlyIcon
          onClick={toggle}
        />
        {separator}
      </>
    ) : (
      parts.map(collection => (
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
            inactiveColor="text-light"
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
