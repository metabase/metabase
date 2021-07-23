/* eslint-disable react/prop-types */
import React from "react";
import { Box } from "grid-styled";

import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import {
  ChildrenContainer,
  ExpandCollectionButton,
  InitialIcon,
  ItemContainer,
} from "./CollectionsList.styled";

import CollectionLink from "metabase/collections/components/CollectionLink";
import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";

function ToggleChildCollectionButton({ action, collectionId, isOpen }) {
  const iconName = isOpen ? "chevrondown" : "chevronright";

  function handleClick(e) {
    e.preventDefault();
    action(collectionId);
  }

  return (
    <ExpandCollectionButton>
      <Icon name={iconName} onClick={handleClick} size={12} />
    </ExpandCollectionButton>
  );
}

function CollectionItem({ action, c, initialIcon, isOpen }) {
  const { archived, children, id, name } = c;

  const hasChildren =
    Array.isArray(children) && children.some(child => !archived);

  return (
    <ItemContainer>
      {hasChildren && (
        <ToggleChildCollectionButton
          action={action}
          collectionId={id}
          isOpen={isOpen}
        />
      )}

      <InitialIcon name={initialIcon} />
      {name}
    </ItemContainer>
  );
}

function Item({
  collection,
  depth,
  currentCollection,
  filter,
  initialIcon,
  onClose,
  onOpen,
  openCollections,
}) {
  const { id, children } = collection;
  const isOpen = openCollections.indexOf(id) >= 0;
  const action = isOpen ? onClose : onOpen;

  return (
    <Box key={id}>
      <CollectionDropTarget collection={collection}>
        {({ highlighted, hovered }) => {
          return (
            <CollectionLink
              to={Urls.collection(collection)}
              selected={id === currentCollection}
              depth={depth}
              // when we click on a link, if there are children, expand to show sub collections
              onClick={() => children && action(id)}
              hovered={hovered}
              highlighted={highlighted}
              role="treeitem"
              aria-expanded={isOpen}
            >
              <CollectionItem
                action={action}
                c={collection}
                initialIcon={initialIcon}
                isOpen={isOpen}
              />
            </CollectionLink>
          );
        }}
      </CollectionDropTarget>

      {children && isOpen && (
        <ChildrenContainer>
          <CollectionsList
            openCollections={openCollections}
            onOpen={onOpen}
            onClose={onClose}
            collections={children}
            filter={filter}
            currentCollection={currentCollection}
            depth={depth + 1}
          />
        </ChildrenContainer>
      )}
    </Box>
  );
}

function CollectionsList({
  collections,
  filter,
  initialIcon = "folder",
  depth = 1,
  ...otherProps
}) {
  const filteredCollections = collections.filter(filter);

  return (
    <Box>
      {filteredCollections.map(collection => (
        <Item
          collection={collection}
          depth={depth}
          filter={filter}
          initialIcon={initialIcon}
          key={collection.id}
          {...otherProps}
        />
      ))}
    </Box>
  );
}

export default CollectionsList;
