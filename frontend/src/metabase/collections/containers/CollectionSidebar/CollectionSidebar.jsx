/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Collection from "metabase/entities/collections";

import {
  LoadingContainer,
  LoadingTitle,
  Sidebar,
  ToggleMobileSidebarIcon,
} from "./CollectionSidebar.styled";

import RootCollectionLink from "./RootCollectionLink/RootCollectionLink";
import Footer from "./CollectionSidebarFooter/CollectionSidebarFooter";
import Collections from "./Collections/Collections";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { getParentPath } from "metabase/collections/utils";

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
class CollectionSidebar extends React.Component {
  state = {
    openCollections: [],
  };

  componentDidUpdate(prevProps) {
    const { collectionId, collections, loading } = this.props;
    const loaded = prevProps.loading && !loading;

    if (loaded) {
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

  renderContent = () => {
    const {
      currentUser,
      handleToggleMobileSidebar,
      isRoot,
      collectionId,
      list,
    } = this.props;
    return (
      <React.Fragment>
        <ToggleMobileSidebarIcon onClick={handleToggleMobileSidebar} />

        <Collection.Loader id="root">
          {({ collection: root }) => (
            <RootCollectionLink
              handleToggleMobileSidebar={handleToggleMobileSidebar}
              isRoot={isRoot}
              root={root}
            />
          )}
        </Collection.Loader>

        <Collections
          collectionId={collectionId}
          currentUserId={currentUser.id}
          handleToggleMobileSidebar={handleToggleMobileSidebar}
          list={list}
          onClose={this.onClose}
          onOpen={this.onOpen}
          openCollections={this.state.openCollections}
        />

        <Footer isAdmin={currentUser.is_superuser} />
      </React.Fragment>
    );
  };

  render() {
    const { allFetched, shouldDisplayMobileSidebar } = this.props;

    return (
      <Sidebar
        role="tree"
        shouldDisplayMobileSidebar={shouldDisplayMobileSidebar}
      >
        {allFetched ? this.renderContent() : <LoadingView />}
      </Sidebar>
    );
  }
}

function LoadingView() {
  return (
    <LoadingContainer>
      <LoadingSpinner />
      <LoadingTitle>{t`Loading…`}</LoadingTitle>
    </LoadingContainer>
  );
}

export default connect(getCurrentUser)(CollectionSidebar);
