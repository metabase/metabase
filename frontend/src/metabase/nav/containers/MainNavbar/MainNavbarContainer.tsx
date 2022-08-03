import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { LocationDescriptor } from "history";
import _ from "underscore";

import { IconProps } from "metabase/components/Icon";
import Modal from "metabase/components/Modal";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import Question from "metabase-lib/lib/Question";
import { Bookmark, Collection, Dashboard, User } from "metabase-types/api";
import { State } from "metabase-types/store";

import Bookmarks, { getOrderedBookmarks } from "metabase/entities/bookmarks";
import Collections, {
  buildCollectionTree,
  getCollectionIcon,
  ROOT_COLLECTION,
} from "metabase/entities/collections";
import { closeNavbar, openNavbar } from "metabase/redux/app";
import { logout } from "metabase/auth/actions";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import {
  getHasDataAccess,
  getHasOwnDatabase,
} from "metabase/new_query/selectors";
import { getQuestion } from "metabase/query_builder/selectors";
import { getDashboard } from "metabase/dashboard/selectors";

import {
  coerceCollectionId,
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";

import { SelectedItem } from "./types";
import MainNavbarView from "./MainNavbarView";
import {
  LoadingContainer,
  LoadingTitle,
  NavRoot,
  Sidebar,
} from "./MainNavbar.styled";

type NavbarModal = "MODAL_NEW_COLLECTION" | null;

function mapStateToProps(state: State) {
  return {
    currentUser: getUser(state),
    isAdmin: getUserIsAdmin(state),
    hasDataAccess: getHasDataAccess(state),
    hasOwnDatabase: getHasOwnDatabase(state),
    bookmarks: getOrderedBookmarks(state),
    question: getQuestion(state),
    dashboard: getDashboard(state),
  };
}

const mapDispatchToProps = {
  openNavbar,
  closeNavbar,
  logout,
  onChangeLocation: push,
  onReorderBookmarks: Bookmarks.actions.reorder,
};

interface CollectionTreeItem extends Collection {
  icon: string | IconProps;
  children: CollectionTreeItem[];
}

type Props = {
  isOpen: boolean;
  isAdmin: boolean;
  currentUser: User;
  bookmarks: Bookmark[];
  collections: Collection[];
  rootCollection: Collection;
  question?: Question;
  dashboard?: Dashboard;
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
  onReorderBookmarks: (bookmarks: Bookmark[]) => void;
};

function MainNavbarContainer({
  bookmarks,
  isAdmin,
  isOpen,
  currentUser,
  hasOwnDatabase,
  collections = [],
  rootCollection,
  question,
  dashboard,
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

  const selectedItems = useMemo<SelectedItem[]>(() => {
    const { pathname } = location;
    const { slug } = params;
    const isCollectionPath = pathname.startsWith("/collection");
    const isUsersCollectionPath = pathname.startsWith("/collection/users");
    const isQuestionPath = pathname.startsWith("/question");
    const isModelPath = pathname.startsWith("/model");
    const isDashboardPath = pathname.startsWith("/dashboard");

    if (isCollectionPath) {
      return [
        {
          id: isUsersCollectionPath ? "users" : Urls.extractCollectionId(slug),
          type: "collection",
        },
      ];
    }
    if (isDashboardPath && dashboard) {
      return [
        {
          id: dashboard.id,
          type: "dashboard",
        },
        {
          id: coerceCollectionId(dashboard.collection_id),
          type: "collection",
        },
      ];
    }
    if ((isQuestionPath || isModelPath) && question) {
      return [
        {
          id: question.id(),
          type: "card",
        },
        {
          id: coerceCollectionId(question.collectionId()),
          type: "collection",
        },
      ];
    }
    return [{ url: pathname, type: "non-entity" }];
  }, [location, params, question, dashboard]);

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
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
          {allFetched ? (
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
    query: () => ({ tree: true, "exclude-archived": true }),
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(MainNavbarContainer);
