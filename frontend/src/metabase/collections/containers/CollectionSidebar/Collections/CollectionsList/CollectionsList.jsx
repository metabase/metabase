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
  c,
  depth,
  currentCollection,
  filter,
  initialIcon,
  onClose,
  onOpen,
  openCollections,
}) {
  const isOpen = openCollections.indexOf(c.id) >= 0;
  const action = isOpen ? onClose : onOpen;

  return (
    <Box key={c.id}>
      <CollectionDropTarget collection={c}>
        {({ highlighted, hovered }) => {
          return (
            <CollectionLink
              to={Urls.collection(c)}
              selected={c.id === currentCollection}
              depth={depth}
              // when we click on a link, if there are children, expand to show sub collections
              onClick={() => c.children && action(c.id)}
              hovered={hovered}
              highlighted={highlighted}
              role="treeitem"
              aria-expanded={isOpen}
            >
              <CollectionItem
                action={action}
                c={c}
                initialIcon={initialIcon}
                isOpen={isOpen}
              />
            </CollectionLink>
          );
        }}
      </CollectionDropTarget>

      {c.children && isOpen && (
        <ChildrenContainer>
          <CollectionsList
            openCollections={openCollections}
            onOpen={onOpen}
            onClose={onClose}
            collections={c.children}
            filter={filter}
            currentCollection={currentCollection}
            depth={depth + 1}
          />
        </ChildrenContainer>
      )}
    </Box>
  );
}

class CollectionsList extends React.Component {
  render() {
    const { collections, filter, ...otherProps } = this.props;
    const filteredCollections = collections.filter(filter);

    return (
      <Box>
        {filteredCollections.map(c => (
          <Item key={c.id} c={c} filter={filter} {...otherProps} />
        ))}
      </Box>
    );
  }
}

CollectionsList.defaultProps = {
  initialIcon: "folder",
  depth: 1,
};

export default CollectionsList;
