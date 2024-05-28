import { Fragment } from "react";

import { isRootCollection } from "metabase/collections/utils";
import { useToggle } from "metabase/hooks/use-toggle";
import CollectionBadge from "metabase/questions/components/CollectionBadge";
import type { Collection } from "metabase-types/api";

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
  const [_, ...crumbsWithoutRoot] = ancestors;
  const parts = hasRoot ? crumbsWithoutRoot : ancestors;

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
      />
    </PathContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
