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
      filter = () => true,
      // hack to support using nested collections in the data selector, we should
      // move to a more elegant so
      // this is a function that accepts a collection item and returns what we want to have happen based on that
      useTriggerComponent,
    } = this.props;
    const collections = this.props.collections.filter(filter);

    return (
      <Box>
        {collections.map(c => {
          return useTriggerComponent(c, this.props);
        })}
      </Box>
    );
  }
}

CollectionsList.defaultProps = {
  initialIcon: "folder",
  depth: 1,
  // named function here avoids eslint error
  useTriggerComponent: function collectionTrigger(c, props) {
    const isOpen = props.openCollections.indexOf(c.id) >= 0;
    const action = isOpen ? props.onClose : props.onOpen;
    return (
      <Box key={c.id}>
        <CollectionDropTarget collection={c}>
          {({ highlighted, hovered }) => {
            return (
              <CollectionLink
                to={Urls.collection(c.id)}
                // TODO - need to make sure the types match here
                selected={String(c.id) === props.currentCollection}
                depth={props.depth}
                // when we click on a link, if there are children, expand to show sub collections
                onClick={() => c.children && action(c.id)}
                hovered={hovered}
                highlighted={highlighted}
              >
                <Flex
                  className="relative"
                  align={
                    // if a colleciton name is somewhat long, align things at flex-start ("top") for a slightly better
                    // visual
                    c.name.length > 25 ? "flex-start" : "center"
                  }
                >
                  {c.children && (
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
                    name={props.initialIcon}
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
              openCollections={props.openCollections}
              onOpen={props.onOpen}
              onClose={props.onClose}
              collections={c.children}
              filter={props.filter}
              currentCollection={props.currentCollection}
              depth={props.depth + 1}
              useTriggerComponent={props.useTriggerComponent}
            />
          </Box>
        )}
      </Box>
    );
  },
};

export default CollectionsList;
