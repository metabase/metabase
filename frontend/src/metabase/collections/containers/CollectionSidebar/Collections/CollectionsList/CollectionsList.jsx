/* eslint-disable react/prop-types */
import React from "react";
import { Box } from "grid-styled";

import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import {
  CollectionListIcon,
  ChildrenContainer,
  ExpandCollectionButton,
  LabelContainer,
} from "./CollectionsList.styled";

import CollectionLink from "metabase/collections/components/CollectionLink";
import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";

const IRREGULAR_COLLECTION_ICON_SIZE = 14;

function ToggleChildCollectionButton({ action, collectionId, isOpen }) {
  const iconName = isOpen ? "chevrondown" : "chevronright";

  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    action(collectionId);
  }

  return (
    <ExpandCollectionButton>
      <Icon name={iconName} onClick={handleClick} size={12} />
    </ExpandCollectionButton>
  );
}

function Label({ action, depth, collection, isOpen }) {
  const { children, id, name } = collection;

  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(collection);
  const hasChildren =
    Array.isArray(children) && children.some(child => !child.archived);

  // Workaround: collection icons on the first tree level incorrect offset out of the box
  const targetOffsetX =
    !isRegular && depth === 1 ? IRREGULAR_COLLECTION_ICON_SIZE : 0;

  return (
    <LabelContainer>
      {hasChildren && (
        <ToggleChildCollectionButton
          action={action}
          collectionId={id}
          isOpen={isOpen}
        />
      )}

      <CollectionListIcon
        collection={collection}
        targetOffsetX={targetOffsetX}
      />
      {name}
    </LabelContainer>
  );
}

function Collection({
  collection,
  depth,
  currentCollection,
  filter,
  handleToggleMobileSidebar,
  initialIcon,
  onClose,
  onOpen,
  openCollections,
}) {
  const { id, children } = collection;
  const isOpen = openCollections.indexOf(id) >= 0;
  const action = isOpen ? onClose : onOpen;

  return (
    <Box>
      <CollectionDropTarget collection={collection}>
        {({ highlighted, hovered }) => {
          const url = Urls.collection(collection);
          const selected = id === currentCollection;
          const dimmedIcon = PLUGIN_COLLECTIONS.isRegularCollection(collection);

          // when we click on a link, if there are children,
          // expand to show sub collections
          function handleClick() {
            handleToggleMobileSidebar();
          }

          return (
            <CollectionLink
              to={url}
              selected={selected}
              depth={depth}
              onClick={handleClick}
              dimmedIcon={dimmedIcon}
              hovered={hovered}
              highlighted={highlighted}
              role="treeitem"
              aria-expanded={isOpen}
            >
              <Label
                action={action}
                collection={collection}
                initialIcon={initialIcon}
                isOpen={isOpen}
                depth={depth}
              />
            </CollectionLink>
          );
        }}
      </CollectionDropTarget>

      {children && isOpen && (
        <ChildrenContainer>
          <CollectionsList
            handleToggleMobileSidebar={handleToggleMobileSidebar}
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
  handleToggleMobileSidebar,
  initialIcon,
  depth = 1,
  ...otherProps
}) {
  const filteredCollections = collections.filter(filter);

  return (
    <Box>
      {filteredCollections.map(collection => (
        <Collection
          collection={collection}
          depth={depth}
          filter={filter}
          handleToggleMobileSidebar={handleToggleMobileSidebar}
          initialIcon={initialIcon}
          key={collection.id}
          {...otherProps}
        />
      ))}
    </Box>
  );
}

CollectionsList.Icon = CollectionListIcon;

export default CollectionsList;
