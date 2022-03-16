import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Bookmark from "metabase/entities/bookmarks";
import Collection from "metabase/entities/collections";
import { getUser } from "metabase/selectors/user";

import {
  LoadingContainer,
  LoadingTitle,
  Sidebar,
  SidebarHeading,
  ToggleMobileSidebarIcon,
} from "metabase/collections/components/CollectionSidebar/CollectionSidebar.styled";

import RootCollectionLink from "metabase/collections/components/CollectionSidebar/RootCollectionLink";
import Footer from "metabase/collections/components/CollectionSidebar/CollectionSidebarFooter";
import Collections from "metabase/collections/components/CollectionSidebar/Collections";
import Bookmarks from "metabase/collections/components/CollectionSidebar/Bookmarks";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { getParentPath } from "metabase/collections/utils";
import { updateOpenCollectionList } from "./updateOpenCollectionList";

const collectionEntityQuery = {
  query: () => ({ tree: true }),

  // Using the default loading wrapper breaks the UI,
  // as the sidebar has a unique fixed left layout
  // It's disabled, so loading can be displayed appropriately
  // See: https://github.com/metabase/metabase/issues/14603
  loadingAndErrorWrapper: false,
};

const mapDispatchToProps = {
  deleteBookmark: (id, type) => Bookmark.actions.delete({ id, type }),
};

function mapStateToProps(state) {
  return {
    currentUser: getUser(state),
  };
}

CollectionSidebar.propTypes = {
  currentUser: PropTypes.object.isRequired,
  collectionId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  collections: PropTypes.arrayOf(PropTypes.object).isRequired,
  bookmarks: PropTypes.arrayOf(PropTypes.object),
  deleteBookmark: PropTypes.func.isRequired,
  isRoot: PropTypes.bool,
  allFetched: PropTypes.bool,
  loading: PropTypes.bool,
  list: PropTypes.arrayOf(PropTypes.object),
  shouldDisplayMobileSidebar: PropTypes.bool,
  handleToggleMobileSidebar: PropTypes.func,
};

function CollectionSidebar({
  bookmarks,
  currentUser,
  collectionId,
  collections,
  deleteBookmark,
  isRoot,
  allFetched,
  loading,
  list,
  shouldDisplayMobileSidebar,
  handleToggleMobileSidebar,
}) {
  const [openCollections, setOpenCollections] = useState([]);

  const onOpen = useCallback(
    id => {
      setOpenCollections([...openCollections, id]);
    },
    [openCollections],
  );

  const onClose = useCallback(
    id => {
      const newOpenCollections = updateOpenCollectionList(
        id,
        collections,
        openCollections,
      );
      setOpenCollections(newOpenCollections);
    },
    [collections, openCollections],
  );

  useEffect(() => {
    if (!loading && collectionId) {
      const ancestors = getParentPath(collections || [], collectionId) || [];
      setOpenCollections(ancestors);
    }
    // collections list is intentionally not listed in dependencies
    // otherwise, the hook can close manually opened collections
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, loading]);

  return (
    <Sidebar
      role="tree"
      shouldDisplayMobileSidebar={shouldDisplayMobileSidebar}
    >
      {allFetched ? (
        <React.Fragment>
          <Bookmarks bookmarks={bookmarks} deleteBookmark={deleteBookmark} />

          {bookmarks.length > 0 && (
            <SidebarHeading>{t`Collections`}</SidebarHeading>
          )}

          <ToggleMobileSidebarIcon onClick={handleToggleMobileSidebar} />
          <RootCollectionLink
            isRoot={isRoot}
            handleToggleMobileSidebar={handleToggleMobileSidebar}
          />
          <Collections
            list={list}
            openCollections={openCollections}
            collectionId={collectionId}
            currentUserId={currentUser.id}
            handleToggleMobileSidebar={handleToggleMobileSidebar}
            onOpen={onOpen}
            onClose={onClose}
          />
          <Footer isAdmin={currentUser.is_superuser} />
        </React.Fragment>
      ) : (
        <LoadingView />
      )}
    </Sidebar>
  );
}

function LoadingView() {
  return (
    <LoadingContainer>
      <LoadingSpinner />
      <LoadingTitle>{t`Loading…`}</LoadingTitle>
    </LoadingContainer>
  );
}

export default _.compose(
  Bookmark.loadList(),
  Collection.loadList(collectionEntityQuery),
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionSidebar);
