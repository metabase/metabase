import React from "react";
import { Box, Flex } from "grid-styled";
import { jt, t } from "ttag";
import { connect } from "react-redux";
import styled from "styled-components";

import * as Urls from "metabase/lib/urls";

import Collection from "metabase/entities/collections";

import CollectionContent from "metabase/collections/containers/CollectionContent";

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
  return collectionList.filter(l => !l.personal_owner_id);
}

// Replace the name for the current user's collection
// @Question - should we just update the API to do this?
function preparePersonalCollection(c) {
  return {
    ...c,
    name: t`Your personal collection`,
  };
}

// Create a fake collection and put other users collections in it
function getCollectionsForAdmin(collectionList, userID) {
  return [
    {
      // TODO - need to figure out how to handle the "Link" for this faux collection since by definition it has no content
      name: t`Other users' personal collections`,
      children: [
        ...collectionList
          .filter(l => l.personal_owner_id && l.personal_owner_id !== userID)
          .map(l => ({
            ...l,
            name: l.name.substring(0, l.name.indexOf("'")),
          })),
      ],
    },
  ];
}

function currentUserPersonalCollections(collectionList, userID) {
  return collectionList
    .filter(l => l.personal_owner_id === userID)
    .map(preparePersonalCollection);
}

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
        <CollectionSidebar w={340} px={"44px"} pt={3}>
          <Greeting />
          <Link
            className="link flex align-center text-bold"
            to={Urls.collection("root")}
            mb={2}
            mt={2}
          >
            <Icon name="folder" mr={1} />
            {t`Our analytics`}
          </Link>
          <Collection.ListLoader>
            {({ list }) => (
              <Box>
                <CollectionsList collections={nonPersonalCollections(list)} />

                <Box mt={"32px"}>
                  <CollectionsList
                    collections={currentUserPersonalCollections(
                      list,
                      currentUser.id,
                    )}
                  />
                </Box>

                {currentUser.is_superuser && (
                  <Box>
                    <CollectionsList
                      collections={getCollectionsForAdmin(list, currentUser.id)}
                      initialIcon="group"
                    />
                  </Box>
                )}
              </Box>
            )}
          </Collection.ListLoader>

          {/* TODO - need to make sure the user can create collections here */}
          <Link
            mt={3}
            to={Urls.newCollection(collectionId)}
            className="link flex align-center text-bold"
            data-metabase-event={`Collection Landing;Collection List; New Collection Click`}
          >
            <Icon name="add" mr={1} />
            {t`New collection`}
          </Link>
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
    const { collections } = this.props;
    const { open } = this.state;

    /* TODO - re-integrate drag and drop from metabase/components/CollectionList */
    return (
      <Box>
        {collections.map(c => {
          return (
            <Box>
              <Flex align="center" className="relative bg-brand-light-hover">
                {c.children && (
                  <Flex
                    className="absolute text-brand cursor-pointer"
                    align="center"
                    justifyContent="center"
                    style={{ left: -16 }}
                  >
                    <Icon
                      name={open === c.id ? "chevrondown" : "chevronright"}
                      onClick={() => this.setState({ open: c.id })}
                      size={12}
                    />
                  </Flex>
                )}
                <Link
                  className="flex align-center link text-bold"
                  my={"10px"}
                  to={Urls.collection(c.id)}
                >
                  <Icon name="folder" mr={"6px"} style={{ opacity: 0.4 }} />
                  {c.name}
                </Link>
              </Flex>
              {c.children && open === c.id && (
                <Box ml="12px">
                  <CollectionsList collections={c.children} />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }
}

export default CollectionLanding;
