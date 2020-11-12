import React from "react";
import { Box, Flex } from "grid-styled";
import { jt, t } from "ttag";
import { connect } from "react-redux";
import styled from "styled-components";

import * as Urls from "metabase/lib/urls";
import { color as metabaseColor } from "metabase/lib/colors";

import Collection from "metabase/entities/collections";

import CollectionContent from "metabase/collections/containers/CollectionContent";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/type/Subhead";

const CollectionSidebar = styled(Box)`
  position: fixed;
  left: 0;
  bottom: 0;
  top: 65px;
  overflow-x: hidden;
  overflow-y: auto;
`;

const PageWrapper = styled(Box)`
  overflow: hidden;
  height: calc(100vh - 65px);
`;

function nonPersonalCollections(collectionList) {
  // return collections that aren't personal and aren't archived
  // TODO - should this be an API thing?
  return collectionList.filter(l => !l.personal_owner_id && !l.archived);
}

// Replace the name for the current user's collection
// @Question - should we just update the API to do this?
function preparePersonalCollection(c) {
  return {
    ...c,
    name: t`Your personal collection`,
  };
}

function currentUserPersonalCollections(collectionList, userID) {
  return collectionList
    .filter(l => l.personal_owner_id === userID)
    .map(preparePersonalCollection);
}

const SIDEBAR_SPACER = 14;

const CollectionLink = styled(Link)`
  position: relative;
  padding-left: ${props =>
    props.depth * (SIDEBAR_SPACER * 2) + SIDEBAR_SPACER}px;
  padding-right: 8px;
  padding-top: 8px;
  padding-bottom: 8px;
  display: flex;
  margin-left: ${props => -props.depth * SIDEBAR_SPACER}px;
  align-items: center;
  font-weight: bold;
  color: ${props => (props.selected ? "white" : metabaseColor("brand"))};
  background-color: ${props =>
    props.selected ? metabaseColor("brand") : "inherit"};
  :hover {
    background-color: ${props => !props.selected && metabaseColor("bg-medium")};
  }
  .Icon {
    fill: ${props => props.selected && "white"};
    opacity: ${props => props.selected && "0.8"};
  }
`;

CollectionLink.defaultProps = {
  depth: 1,
};

@connect(({ currentUser }) => ({ currentUser }))
class CollectionLanding extends React.Component {
  render() {
    const {
      currentUser,
      params: { collectionId },
    } = this.props;
    const isRoot = collectionId === "root";

    return (
      <PageWrapper>
        <CollectionSidebar w={340} pt={3}>
          <Box pl="24px">
            <Greeting />
          </Box>
          <CollectionLink
            to={Urls.collection("root")}
            selected={isRoot}
            mb={2}
            mt={2}
          >
            <Icon name="folder" mr={1} />
            {t`Our analytics`}
          </CollectionLink>
          <Collection.ListLoader>
            {({ list }) => (
              <Box>
                <CollectionsList
                  collections={nonPersonalCollections(list)}
                  currentCollection={collectionId}
                />

                <Box mt={"32px"}>
                  <CollectionsList
                    collections={currentUserPersonalCollections(
                      list,
                      currentUser.id,
                    )}
                    initialIcon="person"
                    currentCollection={collectionId}
                  />
                </Box>

                {currentUser.is_superuser && (
                  <CollectionLink to={Urls.collection("users")}>
                    <Icon name="group" mr={1} />
                    {t`Other users' personal collections`}
                  </CollectionLink>
                )}
              </Box>
            )}
          </Collection.ListLoader>

          <Box className="fixed bottom left" pt={3} pb={2}>
            <Link to={`/archive`} className="link flex align-center">
              <Icon name="view_archive" />
              {t`View archived items`}
            </Link>
          </Box>
        </CollectionSidebar>
        <Box bg="white" className="border-left full-height" ml={340}>
          <CollectionContent isRoot={isRoot} collectionId={collectionId} />
        </Box>
        {
          // Need to have this here so the child modals will show up
          this.props.children
        }
      </PageWrapper>
    );
  }
}

const Greeting = connect(state => ({
  user: state.currentUser,
}))(({ user }) => {
  return (
    <Box mb={3}>
      <Subhead>{jt`Hello there, ${user.first_name}`}</Subhead>
    </Box>
  );
});

class CollectionsList extends React.Component {
  state = {
    // @hack - store the open collection as the collection's id.
    // @TODO - need to figure out how to handle state when using a recursive component
    open: null,
  };
  render() {
    const { collections, initialIcon, currentCollection } = this.props;
    const { open } = this.state;

    /* TODO - re-integrate drag and drop from metabase/components/CollectionList */
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

export default CollectionLanding;
