import React from "react";
import { useToggle } from "metabase/hooks/use-toggle";
import { isRootCollection } from "metabase/collections/utils";
import CollectionBadge from "metabase/questions/components/CollectionBadge";
import { Collection } from "metabase-types/api";
import {
  ExpandButton,
  PathContainer,
  PathSeparator,
} from "./CollectionBreadcrumbs.styled";

export interface CollectionBreadcrumbsProps {
  collection?: Collection;
}

export const CollectionBreadcrumbs = ({
  collection,
}: CollectionBreadcrumbsProps): JSX.Element | null => {
  const [isExpanded, { toggle }] = useToggle(false);

  if (!collection) {
    return null;
  }

  const ancestors = collection.effective_ancestors || [];
  const hasRoot = ancestors[0] && isRootCollection(ancestors[0]);
  const parts = hasRoot ? ancestors.splice(0, 1) : ancestors;

  const content =
    parts.length > 1 && !isExpanded ? (
      <>
        <CollectionBadge
          collectionId={parts[0].id}
          inactiveColor="text-medium"
          isSingleLine
        />
        <PathSeparator>/</PathSeparator>
        <ExpandButton
          small
          borderless
          iconSize={10}
          icon="ellipsis"
          onlyIcon
          onClick={toggle}
        />
        <PathSeparator>/</PathSeparator>
      </>
    ) : (
      parts.map(collection => (
        <>
          <CollectionBadge
            collectionId={collection.id}
            inactiveColor="text-medium"
            isSingleLine
          />
          <PathSeparator>/</PathSeparator>
        </>
      ))
    );

  return (
    <PathContainer>
      {content}
      <CollectionBadge
        collectionId={collection.id}
        inactiveColor="text-medium"
        isSingleLine
      />
    </PathContainer>
  );
};

export default CollectionBreadcrumbs;
