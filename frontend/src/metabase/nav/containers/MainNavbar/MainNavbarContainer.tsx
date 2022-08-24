import React, { useCallback, useEffect, useMemo } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import { IconProps } from "metabase/components/Icon";

import Question from "metabase-lib/lib/Question";
import {
  Bookmark,
  Collection,
  Dashboard,
  DataApp,
  User,
} from "metabase-types/api";
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
import { getQuestion } from "metabase/query_builder/selectors";
import { getDashboard } from "metabase/dashboard/selectors";

import {
  coerceCollectionId,
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";

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
    question: getQuestion(state),
    dashboard: getDashboard(state),
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
  bookmarks: Bookmark[];
  collections: Collection[];
  rootCollection: Collection;
  dataApps: DataApp[];
  question?: Question;
  dashboard?: Dashboard;
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
  isOpen,
  currentUser,
  hasOwnDatabase,
  collections = [],
  rootCollection,
  dataApps = [],
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
  onCreateNewCollection,
  ...props
}: Props) {
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
    const isDataAppPath = pathname.startsWith("/a/");
    const isDashboardPath = pathname.startsWith("/dashboard");

    if (isCollectionPath) {
      return [
        {
          id: isUsersCollectionPath ? "users" : Urls.extractCollectionId(slug),
          type: "collection",
        },
      ];
    }
    if (isDataAppPath) {
      return [
        {
          id: Urls.extractEntityId(slug),
          type: "data-app",
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
