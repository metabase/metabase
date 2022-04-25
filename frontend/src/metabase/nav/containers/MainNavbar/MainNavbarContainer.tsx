import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { LocationDescriptor } from "history";
import _ from "underscore";

import { IconProps } from "metabase/components/Icon";
import Modal from "metabase/components/Modal";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { BookmarksType, Collection, User } from "metabase-types/api";
import { State } from "metabase-types/store";

import Bookmarks from "metabase/entities/bookmarks";
import Collections, {
  ROOT_COLLECTION,
  getCollectionIcon,
  buildCollectionTree,
} from "metabase/entities/collections";
import { openNavbar, closeNavbar } from "metabase/redux/app";
import { logout } from "metabase/auth/actions";
import {
  getHasOwnDatabase,
  getHasDataAccess,
} from "metabase/new_query/selectors";
import { getUser } from "metabase/selectors/user";
import {
  nonPersonalOrArchivedCollection,
  currentUserPersonalCollections,
} from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";

import { SelectedItem } from "./types";
import MainNavbarView from "./MainNavbarView";
import {
  Sidebar,
  NavRoot,
  LoadingContainer,
  LoadingTitle,
} from "./MainNavbar.styled";

type NavbarModal = "MODAL_NEW_COLLECTION" | null;

function mapStateToProps(state: State) {
  return {
    currentUser: getUser(state),
    hasDataAccess: getHasDataAccess(state),
    hasOwnDatabase: getHasOwnDatabase(state),
  };
}

const mapDispatchToProps = {
  openNavbar,
  closeNavbar,
  logout,
  onChangeLocation: push,
};

interface CollectionTreeItem extends Collection {
  icon: string | IconProps;
  children: CollectionTreeItem[];
}

type Props = {
  isOpen: boolean;
  currentUser: User;
  bookmarks: BookmarksType;
  collections: Collection[];
  rootCollection: Collection;
  hasDataAccess: boolean;
  hasOwnDatabase: boolean;
  allFetched: boolean;
  location: {
    pathname: string;
  };
  params: {
    slug?: string;
  };
  openNavbar: () => void;
  closeNavbar: () => void;
  logout: () => void;
  onChangeLocation: (location: LocationDescriptor) => void;
};

function MainNavbarContainer({
  bookmarks,
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
  ...props
}: Props) {
  const [orderedBookmarks, setOrderedBookmarks] = useState([]);
  const [modal, setModal] = useState<NavbarModal>(null);

  useEffect(() => {
    if (bookmarks?.length !== orderedBookmarks?.length) {
      setOrderedBookmarks(bookmarks as any);
    }
  }, [orderedBookmarks, bookmarks]);

  useEffect(() => {
    function handleSidebarKeyboardShortcut(e: KeyboardEvent) {
      if (e.key === "." && (e.ctrlKey || e.metaKey)) {
        if (isOpen) {
          closeNavbar();
        } else {
          openNavbar();
        }
      }
    }

    window.addEventListener("keydown", handleSidebarKeyboardShortcut);
    return () => {
      window.removeEventListener("keydown", handleSidebarKeyboardShortcut);
    };
  }, [isOpen, openNavbar, closeNavbar]);

  const selectedItem = useMemo<SelectedItem>(() => {
    const { pathname } = location;
    const { slug } = params;
    if (pathname.startsWith("/collection")) {
      const id = pathname.startsWith("/collection/users")
        ? "users"
        : Urls.extractCollectionId(slug);
      return { type: "collection", id };
    }
    if (pathname.startsWith("/dashboard")) {
      return { type: "dashboard", id: Urls.extractEntityId(slug) };
    }
    if (pathname.startsWith("/question") || pathname.startsWith("/model")) {
      return { type: "card", id: Urls.extractEntityId(slug) };
    }
    return { type: "non-entity", url: pathname };
  }, [location, params]);

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    if (!rootCollection) {
      return [];
    }

    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const nonPersonalOrArchivedCollections = collections.filter(
      nonPersonalOrArchivedCollection,
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...nonPersonalOrArchivedCollections);

    const root: CollectionTreeItem = {
      ...rootCollection,
      icon: getCollectionIcon(rootCollection),
      children: [],
    };

    return [root, ...buildCollectionTree(preparedCollections)];
  }, [rootCollection, collections, currentUser]);

  const reorderBookmarks = useCallback(
    ({ newIndex, oldIndex }) => {
      const bookmarksToBeReordered =
        orderedBookmarks.length > 0 ? [...orderedBookmarks] : [...bookmarks];
      const element = bookmarksToBeReordered[oldIndex];

      bookmarksToBeReordered.splice(oldIndex, 1);
      bookmarksToBeReordered.splice(newIndex, 0, element);

      setOrderedBookmarks(bookmarksToBeReordered as any);
      Bookmarks.actions.reorder(bookmarksToBeReordered);
    },
    [bookmarks, orderedBookmarks],
  );

  const onCreateNewCollection = useCallback(() => {
    setModal("MODAL_NEW_COLLECTION");
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const renderModalContent = useCallback(() => {
    if (modal === "MODAL_NEW_COLLECTION") {
      return (
        <CollectionCreate
          onClose={closeModal}
          onSaved={(collection: Collection) => {
            closeModal();
            onChangeLocation(Urls.collection(collection));
          }}
        />
      );
    }
    return null;
  }, [modal, closeModal, onChangeLocation]);

  return (
    <>
      <Sidebar className="Nav" isOpen={isOpen} aria-hidden={!isOpen}>
        <NavRoot isOpen={isOpen}>
          {allFetched && rootCollection ? (
            <MainNavbarView
              {...props}
              bookmarks={
                orderedBookmarks.length > 0 ? orderedBookmarks : bookmarks
              }
              isOpen={isOpen}
              currentUser={currentUser}
              collections={collectionTree}
              hasOwnDatabase={hasOwnDatabase}
              selectedItem={selectedItem}
              hasDataAccess={hasDataAccess}
              reorderBookmarks={reorderBookmarks}
              handleCreateNewCollection={onCreateNewCollection}
              handleCloseNavbar={closeNavbar}
              handleLogout={logout}
            />
          ) : (
            <LoadingContainer>
              <LoadingSpinner />
              <LoadingTitle>{t`Loading…`}</LoadingTitle>
            </LoadingContainer>
          )}
        </NavRoot>
      </Sidebar>
      {modal && <Modal onClose={closeModal}>{renderModalContent()}</Modal>}
    </>
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
    query: () => ({ tree: true }),
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(MainNavbarContainer);
