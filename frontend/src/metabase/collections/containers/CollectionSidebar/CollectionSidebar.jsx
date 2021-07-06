/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { Box } from "grid-styled";
import { t } from "ttag";
import styled from "styled-components";
import _ from "underscore";

import * as Urls from "metabase/lib/urls";

import Collection from "metabase/entities/collections";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";

import { Sidebar, ToggleMobileSidebarIcon } from "./CollectionSidebar.styled";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import CollectionsList from "metabase/collections/components/CollectionsList";
import CollectionLink from "metabase/collections/components/CollectionLink";

import { SIDEBAR_SPACER } from "metabase/collections/constants";
import {
  nonPersonalOrArchivedCollection,
  currentUserPersonalCollections,
  isAnotherUsersPersonalCollection,
  getParentPath,
  getParentPersonalCollection,
} from "metabase/collections/utils";

function mapStateToProps(state) {
  return {
    currentUser: state.currentUser,
    collectionsById: state.entities.collections,
  };
}

const getCurrentUser = ({ currentUser }) => ({ currentUser });

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
@connect(mapStateToProps)
class CollectionSidebar extends React.Component {
  state = {
    openCollections: [],
  };

  checkCollectionsMapChanged = prevMap => {
    const prevKeys = Object.keys(prevMap);
    const keys = Object.keys(this.props.collectionsById);
    if (prevKeys.length !== keys.length) {
      return true;
    }
    return !_.isEqual(prevKeys.sort(), keys.sort());
  };

  componentDidUpdate(prevProps) {
    const { collectionId, collections, collectionsById, loading } = this.props;
    const loaded = prevProps.loading && !loading;
    if (loaded || this.checkCollectionsMapChanged(prevProps.collectionsById)) {
      const ancestors = getParentPath(collections, collectionId) || [];
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
    const {
      currentUser,
      handleToggleMobileSidebar,
      isRoot,
      collectionId,
      collectionsById,
      list,
    } = this.props;

    const isAnotherUserCollectionOpened = isAnotherUsersPersonalCollection(
      parseInt(collectionId),
      collectionsById,
      currentUser.id,
    );

    return (
      <React.Fragment>
        <ToggleMobileSidebarIcon onClick={handleToggleMobileSidebar} />
        <Collection.Loader id="root">
          {({ collection: root }) => (
            <Box mb={1} mt={2}>
              <CollectionDropTarget collection={root}>
                {({ highlighted, hovered }) => (
                  <CollectionLink
                    to={Urls.collection({ id: "root" })}
                    selected={isRoot}
                    highlighted={highlighted}
                    hovered={hovered}
                  >
                    {t`Our analytics`}
                  </CollectionLink>
                )}
              </CollectionDropTarget>
            </Box>
          )}
        </Collection.Loader>

        <Box pb={4}>
          <CollectionsList
            openCollections={this.state.openCollections}
            onClose={this.onClose}
            onOpen={this.onOpen}
            collections={list}
            filter={nonPersonalOrArchivedCollection}
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

        <Box className="mt-auto" pb={2}>
          {currentUser.is_superuser && isAnotherUserCollectionOpened && (
            <CollectionsList
              openCollections={this.state.openCollections}
              onClose={this.onClose}
              onOpen={this.onOpen}
              collections={getParentPersonalCollection(
                parseInt(collectionId),
                collectionsById,
              )}
              initialIcon="group"
              filter={this.filterPersonalCollections}
              currentCollection={collectionId}
            />
          )}
          <Box pl={SIDEBAR_SPACER * 2}>
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
        </Box>
      </React.Fragment>
    );
  };

  render() {
    const { allFetched } = this.props;

    return (
      <Sidebar
        role="tree"
        shouldDisplayMobileSidebar={this.props.shouldDisplayMobileSidebar}
      >
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

export default CollectionSidebar;
