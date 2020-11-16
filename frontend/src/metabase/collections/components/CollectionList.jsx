import React from "react";
import { Box, Flex } from "grid-styled";

import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";

import CollectionLink from "metabase/collections/components/CollectionLink";
import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import { SIDEBAR_SPACER } from "metabase/collections/constants";

class CollectionsList extends React.Component {
  state = {
    // @hack - store the open collection as the collection's id.
    // @TODO - need to figure out how to handle state when using a recursive component
    open: null,
  };
  render() {
    const { initialIcon, currentCollection, filter = () => true } = this.props;
    const collections = this.props.collections.filter(filter);
    const { open } = this.state;

    return (
      <Box>
        {collections.map(c => {
          return (
            <Box key={c.id}>
              <CollectionDropTarget collection={c}>
                {({ highlighted, hovered }) => (
                  <CollectionLink
                    to={Urls.collection(c.id)}
                    // TODO - need to make sure the types match here
                    selected={String(c.id) === currentCollection}
                    depth={this.props.depth}
                    // when we click on a link, if there are children, expand to show sub collections
                    onClick={() => c.children && this.setState({ open: c.id })}
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
                          style={{ left: -16 }}
                        >
                          <Icon
                            name={
                              open === c.id ? "chevrondown" : "chevronright"
                            }
                            onClick={ev => {
                              ev.preventDefault();
                              this.setState({
                                open: this.state.open ? null : c.id,
                              });
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
                )}
              </CollectionDropTarget>
              {c.children && open === c.id && (
                <Box ml={-SIDEBAR_SPACER} pl={SIDEBAR_SPACER + 10}>
                  <CollectionsList
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
