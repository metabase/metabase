import React, { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { LocationDescriptor } from "history";

import Modal from "metabase/components/Modal";

import * as Urls from "metabase/lib/urls";

import type { Bookmark, Collection, User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import Bookmarks, { getOrderedBookmarks } from "metabase/entities/bookmarks";
import Collections, {
  buildCollectionTree,
  getCollectionIcon,
  ROOT_COLLECTION,
  CollectionTreeItem,
} from "metabase/entities/collections";
import Databases from "metabase/entities/databases";
import { logout } from "metabase/auth/actions";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { getHasDataAccess, getHasOwnDatabase } from "metabase/selectors/data";

import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import {
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import Database from "metabase-lib/metadata/Database";

import { MainNavbarProps, SelectedItem } from "../types";
import NavbarLoadingView from "../NavbarLoadingView";

import MainNavbarView from "./MainNavbarView";

type NavbarModal = "MODAL_NEW_COLLECTION" | null;

function mapStateToProps(state: State, { databases = [] }: DatabaseProps) {
  return {
    currentUser: getUser(state),
    isAdmin: getUserIsAdmin(state),
    hasDataAccess: getHasDataAccess(databases),
    hasOwnDatabase: getHasOwnDatabase(databases),
    bookmarks: getOrderedBookmarks(state),
  };
}

const mapDispatchToProps = {
  logout,
  onReorderBookmarks: Bookmarks.actions.reorder,
};

interface Props extends MainNavbarProps {
  isAdmin: boolean;
  currentUser: User;
  selectedItems: SelectedItem[];
  bookmarks: Bookmark[];
  collections: Collection[];
  rootCollection: Collection;
  hasDataAccess: boolean;
  hasOwnDatabase: boolean;
  allFetched: boolean;
  logout: () => void;
  onReorderBookmarks: (bookmarks: Bookmark[]) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

interface DatabaseProps {
  databases?: Database[];
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
  hasDataAccess,
  allFetched,
  location,
  params,
  openNavbar,
  closeNavbar,
  logout,
  onChangeLocation,
  onReorderBookmarks,
  ...props
}: Props) {
  const [modal, setModal] = useState<NavbarModal>(null);

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const displayableCollections = collections.filter(collection =>
      nonPersonalOrArchivedCollection(collection),
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

  const onCreateNewCollection = useCallback(() => {
    setModal("MODAL_NEW_COLLECTION");
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const renderModalContent = useCallback(() => {
    if (modal === "MODAL_NEW_COLLECTION") {
      return (
        <CreateCollectionModal
          onClose={closeModal}
          onCreate={(collection: Collection) => {
            closeModal();
            onChangeLocation(Urls.collection(collection));
          }}
        />
      );
    }
    return null;
  }, [modal, closeModal, onChangeLocation]);

  if (!allFetched) {
    return <NavbarLoadingView />;
  }

  return (
    <>
      <MainNavbarView
        {...props}
        bookmarks={bookmarks}
        isAdmin={isAdmin}
        isOpen={isOpen}
        currentUser={currentUser}
        collections={collectionTree}
        hasOwnDatabase={hasOwnDatabase}
        selectedItems={selectedItems}
        hasDataAccess={hasDataAccess}
        reorderBookmarks={reorderBookmarks}
        handleCreateNewCollection={onCreateNewCollection}
        handleCloseNavbar={closeNavbar}
        handleLogout={logout}
      />

      {modal && <Modal onClose={closeModal}>{renderModalContent()}</Modal>}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
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
    query: () => ({
      tree: true,
      "exclude-other-user-collections": true,
      "exclude-archived": true,
    }),
    loadingAndErrorWrapper: false,
  }),
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(MainNavbarContainer);
