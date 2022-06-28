import React from "react";
import { useToggle } from "metabase/hooks/use-toggle";
import Icon from "metabase/components/Icon";
import CollectionBadge from "metabase/questions/components/CollectionBadge";
import { Collection } from "metabase-types/api";
import {
  ExpandButton,
  PathContainer,
  PathSeparator,
} from "./CollectionBreadcrumbs.styled";
import { isRootCollection } from "metabase/collections/utils";

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
        />
        <CollectionSeparator onClick={toggle} />
        <ExpandButton
          small
          borderless
          iconSize={10}
          icon="ellipsis"
          onlyIcon
          onClick={toggle}
        />
        <CollectionSeparator onClick={toggle} />
      </>
    ) : (
      parts.map(collection => (
        <>
          <CollectionBadge
            collectionId={collection.id}
            inactiveColor="text-medium"
          />
          <CollectionSeparator onClick={toggle} />
        </>
      ))
    );

  return (
    <PathContainer>
      {content}
      <CollectionBadge
        collectionId={collection.id}
        inactiveColor="text-medium"
      />
    </PathContainer>
  );
};

interface CollectionSeparatorProps {
  onClick: () => void;
}

const CollectionSeparator = ({ onClick }: CollectionSeparatorProps) => (
  <PathSeparator onClick={onClick}>
    <Icon name="chevronright" size={8} />
  </PathSeparator>
);

export default CollectionBreadcrumbs;
