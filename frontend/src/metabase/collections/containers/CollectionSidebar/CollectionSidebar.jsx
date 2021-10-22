import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Collection from "metabase/entities/collections";
import { getUser } from "metabase/selectors/user";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { getParentPath } from "metabase/collections/utils";

import {
  LoadingContainer,
  LoadingTitle,
  Sidebar,
  ToggleMobileSidebarIcon,
} from "./CollectionSidebar.styled";
import RootCollectionLink from "./RootCollectionLink/RootCollectionLink";
import Footer from "./CollectionSidebarFooter/CollectionSidebarFooter";
import Collections from "./Collections/Collections";
import { updateOpenCollectionList } from "./updateOpenCollectionList";

const collectionEntityQuery = {
  query: () => ({ tree: true }),

  // Using the default loading wrapper breaks the UI,
  // as the sidebar has a unique fixed left layout
  // It's disabled, so loading can be displayed appropriately
  // See: https://github.com/metabase/metabase/issues/14603
  loadingAndErrorWrapper: false,
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
  isRoot: PropTypes.bool,
  allFetched: PropTypes.bool,
  loading: PropTypes.bool,
  list: PropTypes.arrayOf(PropTypes.object),
  shouldDisplayMobileSidebar: PropTypes.bool,
  handleToggleMobileSidebar: PropTypes.func,
};

function CollectionSidebar({
  currentUser,
  collectionId,
  collections,
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
  Collection.loadList(collectionEntityQuery),
  connect(mapStateToProps),
)(CollectionSidebar);
