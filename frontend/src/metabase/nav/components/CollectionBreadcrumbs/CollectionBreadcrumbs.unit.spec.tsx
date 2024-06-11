import { Fragment } from "react";

import { isRootCollection } from "metabase/collections/utils";
import { useToggle } from "metabase/hooks/use-toggle";
import CollectionBadge from "metabase/questions/components/CollectionBadge";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
} from "metabase-types/api";

import {
  ExpandButton,
  PathContainer,
  PathSeparator,
} from "./CollectionBreadcrumbs.styled";

export interface CollectionBreadcrumbsProps {
  collection?: Collection;
  onClick?: (collection: CollectionEssentials) => void;
  baseCollectionId: CollectionId | null;
}

function getCollectionList({
  baseCollectionId = null,
  collection,
}: {
  collection: Collection;
  baseCollectionId?: CollectionId | null;
}) {
  if (baseCollectionId && collection.id === baseCollectionId) {
    return [];
  }

  const ancestors = collection.effective_ancestors || [];
  const hasRoot = ancestors[0] && isRootCollection(ancestors[0]);
  const [_, ...crumbsWithoutRoot] = ancestors;

  if (baseCollectionId) {
    const index = ancestors.findIndex(part => part.id === baseCollectionId);
    return ancestors.slice(index);
  } else {
    return hasRoot ? crumbsWithoutRoot : ancestors;
  }
}

export const CollectionBreadcrumbs = ({
  collection,
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

  const content =
    parts.length > 1 && !isExpanded ? (
      <>
        <CollectionBadge
          collectionId={parts[0].id}
          inactiveColor="text-medium"
          isSingleLine
          onClick={onClick ? () => onClick(parts[0]) : undefined}
        />
        <PathSeparator>/</PathSeparator>
        <ExpandButton
          small
          borderless
          icon="ellipsis"
          onlyIcon
          onClick={toggle}
        />
        <PathSeparator>/</PathSeparator>
      </>
    ) : (
      parts.map(collection => (
        <Fragment key={collection.id}>
          <CollectionBadge
            collectionId={collection.id}
            inactiveColor="text-medium"
            isSingleLine
            onClick={onClick ? () => onClick(collection) : undefined}
          />
          <PathSeparator>/</PathSeparator>
        </Fragment>
      ))
    );

  return (
    <PathContainer>
      {content}
      <CollectionBadge
        collectionId={collection.id}
        inactiveColor="text-medium"
        isSingleLine
        onClick={onClick ? () => onClick(collection) : undefined}
      />
    </PathContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
