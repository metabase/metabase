/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { Box } from "grid-styled";
import { t } from "ttag";
import styled from "styled-components";

import * as Urls from "metabase/lib/urls";

import Collection from "metabase/entities/collections";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import CollectionsList from "metabase/collections/components/CollectionsList";
import CollectionLink from "metabase/collections/components/CollectionLink";

import { SIDEBAR_SPACER } from "metabase/collections/constants";
import {
  nonPersonalCollection,
  currentUserPersonalCollections,
  getParentPath,
} from "metabase/collections/utils";

const getCurrentUser = ({ currentUser }) => ({ currentUser });

// TODO - what's different about this from another sidebar component?
const Sidebar = styled(Box)`
  position: fixed;
  left: 0;
  bottom: 0;
  top: 65px;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

@Collection.loadList({
  /* pass "tree" here so that the collection entity knows to use the /tree endpoint and send children in the response
    we should eventually refactor code elsewhere in the app to use this by default instead of determining the relationships clientside, but this works in the interim
  */
  query: () => ({ tree: true }),

  // Using the default loading wrapper breaks the UI,
  // as the sidebar has a unique fixed left layout
  // It's disabled, so loading can be displayed appropriately
  // See: https://github.com/metabase/metabase/issues/14603
  loadingAndErrorWrapper: false,
})
class CollectionSidebar extends React.Component {
  state = {
    openCollections: [],
  };

  componentDidUpdate(prevProps) {
    const { collectionId, collections, loading } = this.props;
    const loaded = prevProps.loading && !loading;
    if (loaded) {
      const ancestors = getParentPath(collections, Number(collectionId)) || [];
      this.setState({ openCollections: ancestors });
    }
  }

  onOpen = id => {
    this.setState({ openCollections: this.state.openCollections.concat(id) });
  };

  onClose = id => {
    this.setState({
      openCollections: this.state.openCollections.filter(c => {
        return c !== id;
      }),
    });
  };

  // TODO Should we update the API to filter archived collections?
  filterPersonalCollections = collection => !collection.archived;

  renderContent = () => {
    const { currentUser, isRoot, collectionId, list } = this.props;
    return (
      <React.Fragment>
        <CollectionLink
          to={Urls.collection("root")}
          selected={isRoot}
          mb={1}
          mt={2}
        >
          <Icon name="folder" mr={1} />
          {t`Our analytics`}
        </CollectionLink>
        <Box pb={4}>
          <CollectionsList
            openCollections={this.state.openCollections}
            onClose={this.onClose}
            onOpen={this.onOpen}
            collections={list}
            filter={nonPersonalCollection}
            currentCollection={collectionId}
          />

          <Box>
            <CollectionsList
              openCollections={this.state.openCollections}
              onClose={this.onClose}
              onOpen={this.onOpen}
              collections={currentUserPersonalCollections(list, currentUser.id)}
              initialIcon="person"
              filter={this.filterPersonalCollections}
              currentCollection={collectionId}
            />
          </Box>
        </Box>

        <Box className="mt-auto" pb={2} pl={SIDEBAR_SPACER * 2}>
          {currentUser.is_superuser && (
            <Link
              my={2}
              to={Urls.collection("users")}
              className="flex align-center text-bold text-light text-brand-hover"
            >
              <Icon name="group" mr={1} />
              {t`Other users' personal collections`}
            </Link>
          )}
          <Link
            to={`/archive`}
            className="flex align-center text-bold text-light text-brand-hover"
          >
            <Icon name="view_archive" mr={1} />
            {t`View archive`}
          </Link>
        </Box>
      </React.Fragment>
    );
  };

  render() {
    const { allFetched } = this.props;

    return (
      <Sidebar w={340} pt={3} data-testid="sidebar" role="tree">
        {allFetched ? (
          this.renderContent()
        ) : (
          <div className="text-brand text-centered">
            <LoadingSpinner />
            <h2 className="text-normal text-light mt1">{t`Loading…`}</h2>
          </div>
        )}
      </Sidebar>
    );
  }
}

export default connect(getCurrentUser)(CollectionSidebar);
