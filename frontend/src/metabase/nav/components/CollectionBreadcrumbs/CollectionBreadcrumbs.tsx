import { Fragment, type PropsWithChildren, type ReactNode } from "react";

import { useToggle } from "metabase/hooks/use-toggle";
import { CollectionBadge } from "metabase/questions/components/CollectionBadge";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
} from "metabase-types/api";

import {
  ExpandButton,
  PathContainer,
  BreadcrumbsPathSeparator,
} from "./CollectionBreadcrumbs.styled";
import { getCollectionList } from "./utils";

export interface CollectionBreadcrumbsProps {
  collection?: Collection;
  onClick?: (collection: CollectionEssentials) => void;
  baseCollectionId: CollectionId | null;
  PathSeparator?: string | ((props: { children?: string }) => ReactNode);
}

const DefaultPathSeparator = ({ children = "/" }: PropsWithChildren) => {
  return <BreadcrumbsPathSeparator>{children}</BreadcrumbsPathSeparator>;
};

export const CollectionBreadcrumbs = ({
  collection,
  onClick,
  baseCollectionId = null,
  PathSeparator = DefaultPathSeparator,
}: CollectionBreadcrumbsProps): JSX.Element | null => {
  const [isExpanded, { toggle }] = useToggle(false);

  if (!collection) {
    return null;
  }

  const parts = getCollectionList({
    baseCollectionId,
    collection,
  });

  const separator =
    typeof PathSeparator === "string" ? (
      <BreadcrumbsPathSeparator>{PathSeparator}</BreadcrumbsPathSeparator>
    ) : (
      <PathSeparator />
    );

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
    <PathContainer>
      {content}
      <CollectionBadge
        collectionId={collection.id}
        isSingleLine
        onClick={onClick ? () => onClick(collection) : undefined}
      />
    </PathContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
