/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";

import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";

import CollectionLink from "metabase/collections/components/CollectionLink";
import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import { SIDEBAR_SPACER } from "metabase/collections/constants";

class CollectionsList extends React.Component {
  render() {
    const {
      initialIcon,
      currentCollection,
      filter = () => true,
      openCollections,
    } = this.props;
    const collections = this.props.collections.filter(filter);

    return (
      <Box>
        {collections.map(c => {
          const isOpen = openCollections.indexOf(c.id) >= 0;
          const action = isOpen ? this.props.onClose : this.props.onOpen;
          const hasChildren =
            Array.isArray(c.children) &&
            c.children.some(child => !child.archived);
          return (
            <Box key={c.id}>
              <CollectionDropTarget collection={c}>
                {({ highlighted, hovered }) => {
                  return (
                    <CollectionLink
                      to={Urls.collection(c)}
                      selected={c.id === currentCollection}
                      depth={this.props.depth}
                      // when we click on a link, if there are children, expand to show sub collections
                      onClick={() => c.children && action(c.id)}
                      hovered={hovered}
                      highlighted={highlighted}
                      role="treeitem"
                      aria-expanded={isOpen}
                    >
                      <Flex
                        className="relative"
                        align={
                          // if a collection name is somewhat long, align things at flex-start ("top") for a slightly better
                          // visual
                          c.name.length > 25 ? "flex-start" : "center"
                        }
                      >
                        {hasChildren && (
                          <Flex
                            className="absolute text-brand cursor-pointer"
                            align="center"
                            justifyContent="center"
                            style={{ left: -20 }}
                          >
                            <Icon
                              name={isOpen ? "chevrondown" : "chevronright"}
                              onClick={ev => {
                                ev.preventDefault();
                                action(c.id);
                              }}
                              size={12}
                            />
                          </Flex>
                        )}
                        <Icon
                          name={initialIcon}
                          mr={"6px"}
                          style={{ opacity: 0.4 }}
                        />
                        {c.name}
                      </Flex>
                    </CollectionLink>
                  );
                }}
              </CollectionDropTarget>
              {c.children && isOpen && (
                <Box ml={-SIDEBAR_SPACER} pl={SIDEBAR_SPACER + 10}>
                  <CollectionsList
                    openCollections={openCollections}
                    onOpen={this.props.onOpen}
                    onClose={this.props.onClose}
                    collections={c.children}
                    filter={filter}
                    currentCollection={currentCollection}
                    depth={this.props.depth + 1}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }
}

CollectionsList.defaultProps = {
  initialIcon: "folder",
  depth: 1,
};

export default CollectionsList;
