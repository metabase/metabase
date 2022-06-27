import React from "react";
import { useToggle } from "metabase/hooks/use-toggle";
import Icon from "metabase/components/Icon";
import CollectionBadge from "metabase/questions/components/CollectionBadge";
import { Collection } from "metabase-types/api";

import {
  ExpandButton,
  PathContainer,
  PathSeparator,
} from "./PathBreadcrumbs.styled";

export interface PathBreadcrumbsProps {
  collection?: Collection;
}

export const PathBreadcrumbs = ({
  collection,
}: PathBreadcrumbsProps): JSX.Element | null => {
  const [isExpanded, { toggle }] = useToggle(false);

  if (!collection) {
    return null;
  }

  const ancestors = collection.effective_ancestors || [];
  const parts =
    ancestors[0]?.id === "root" ? ancestors.splice(0, 1) : ancestors;

  let content;
  if (parts.length > 1 && !isExpanded) {
    content = (
      <>
        <CollectionBadge
          collectionId={parts[0].id}
          inactiveColor="text-medium"
        />
        <Separator onClick={toggle} />
        <ExpandButton
          small
          borderless
          iconSize={10}
          icon="ellipsis"
          onlyIcon
          onClick={toggle}
        />
        <Separator onClick={toggle} />
      </>
    );
  } else {
    content = parts.map(collection => (
      <>
        <CollectionBadge
          collectionId={collection.id}
          inactiveColor="text-medium"
        />
        <Separator onClick={toggle} />
      </>
    ));
  }
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

interface SeparatorProps {
  onClick: () => void;
}

const Separator = (props: SeparatorProps) => (
  <PathSeparator {...props}>
    <Icon name="chevronright" size={8} />
  </PathSeparator>
);

export default PathBreadcrumbs;
