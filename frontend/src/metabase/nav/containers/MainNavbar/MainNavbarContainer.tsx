import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import { IconProps } from "metabase/components/Icon";

import { Bookmark, Collection, DataApp, User } from "metabase-types/api";
import { State } from "metabase-types/store";

import DataApps, { isDataAppCollection } from "metabase/entities/data-apps";
import Bookmarks, { getOrderedBookmarks } from "metabase/entities/bookmarks";
import Collections, {
  buildCollectionTree,
  getCollectionIcon,
  ROOT_COLLECTION,
} from "metabase/entities/collections";
import { logout } from "metabase/auth/actions";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import {
  getHasDataAccess,
  getHasOwnDatabase,
} from "metabase/new_query/selectors";

import {
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";

import { MainNavbarProps, SelectedItem } from "./types";
import MainNavbarView from "./MainNavbarView";
import NavbarLoadingView from "./NavbarLoadingView";

function mapStateToProps(state: State) {
  return {
    currentUser: getUser(state),
    isAdmin: getUserIsAdmin(state),
    hasDataAccess: getHasDataAccess(state),
    hasOwnDatabase: getHasOwnDatabase(state),
    bookmarks: getOrderedBookmarks(state),
  };
}

const mapDispatchToProps = {
  logout,
  onReorderBookmarks: Bookmarks.actions.reorder,
};

interface CollectionTreeItem extends Collection {
  icon: string | IconProps;
  children: CollectionTreeItem[];
}

interface Props extends MainNavbarProps {
  isAdmin: boolean;
  currentUser: User;
  selectedItems: SelectedItem[];
  bookmarks: Bookmark[];
  collections: Collection[];
  rootCollection: Collection;
  dataApps: DataApp[];
  hasDataAccess: boolean;
  hasOwnDatabase: boolean;
  allFetched: boolean;
  logout: () => void;
  onReorderBookmarks: (bookmarks: Bookmark[]) => void;
  onCreateNewCollection: () => void;
}

function MainNavbarContainer({
  bookmarks,
  isAdmin,
  selectedItems,
  isOpen,
  currentUser,
  hasOwnDatabase,
  collections = [],
  rootCollection,
  dataApps = [],
  hasDataAccess,
  allFetched,
  location,
  params,
  openNavbar,
  closeNavbar,
  logout,
  onChangeLocation,
  onReorderBookmarks,
  onCreateNewCollection,
  ...props
}: Props) {
  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const displayableCollections = collections.filter(
      collection =>
        nonPersonalOrArchivedCollection(collection) &&
        !isDataAppCollection(collection),
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...displayableCollections);

    const tree = buildCollectionTree(preparedCollections);

    if (rootCollection) {
      const root: CollectionTreeItem = {
        ...rootCollection,
        icon: getCollectionIcon(rootCollection),
        children: [],
      };
      return [root, ...tree];
    } else {
      return tree;
    }
  }, [rootCollection, collections, currentUser]);

  const reorderBookmarks = useCallback(
    ({ newIndex, oldIndex }) => {
      const newBookmarks = [...bookmarks];
      const movedBookmark = newBookmarks[oldIndex];

      newBookmarks.splice(oldIndex, 1);
      newBookmarks.splice(newIndex, 0, movedBookmark);

      onReorderBookmarks(newBookmarks);
    },
    [bookmarks, onReorderBookmarks],
  );

  if (!allFetched) {
    return <NavbarLoadingView />;
  }

  return (
    <MainNavbarView
      {...props}
      bookmarks={bookmarks}
      isAdmin={isAdmin}
      isOpen={isOpen}
      currentUser={currentUser}
      collections={collectionTree}
      dataApps={dataApps}
      hasOwnDatabase={hasOwnDatabase}
      selectedItems={selectedItems}
      hasDataAccess={hasDataAccess}
      reorderBookmarks={reorderBookmarks}
      handleCreateNewCollection={onCreateNewCollection}
      handleCloseNavbar={closeNavbar}
      handleLogout={logout}
    />
  );
}

export default _.compose(
  Bookmarks.loadList({
    loadingAndErrorWrapper: false,
  }),
  Collections.load({
    id: ROOT_COLLECTION.id,
    entityAlias: "rootCollection",
    loadingAndErrorWrapper: false,
  }),
  Collections.loadList({
    query: () => ({ tree: true, "exclude-archived": true }),
    loadingAndErrorWrapper: false,
  }),
  DataApps.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(MainNavbarContainer);
