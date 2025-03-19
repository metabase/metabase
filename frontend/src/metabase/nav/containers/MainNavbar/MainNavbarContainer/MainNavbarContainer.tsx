import type { LocationDescriptor } from "history";
import { memo, useCallback, useMemo } from "react";
import _ from "underscore";

import {
  useGetCollectionQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { logout } from "metabase/auth/actions";
import {
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import Bookmarks, { getOrderedBookmarks } from "metabase/entities/bookmarks";
import type { CollectionTreeItem } from "metabase/entities/collections";
import Collections, {
  ROOT_COLLECTION,
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/entities/collections";
import Databases from "metabase/entities/databases";
import { connect, useDispatch } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";
import { getHasDataAccess } from "metabase/selectors/data";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { NavbarErrorView } from "../NavbarErrorView";
import { NavbarLoadingView } from "../NavbarLoadingView";
import type { MainNavbarProps, SelectedItem } from "../types";

import { MainNavbarView } from "./MainNavbarView";

function mapStateToProps(state: State, { databases = [] }: DatabaseProps) {
  return {
    currentUser: getUser(state),
    isAdmin: getUserIsAdmin(state),
    hasDataAccess: getHasDataAccess(databases),
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
  databases: Database[];
  selectedItems: SelectedItem[];
  bookmarks: Bookmark[];
  rootCollection: Collection;
  hasDataAccess: boolean;
  allError: boolean;
  allFetched: boolean;
  logout: () => void;
  onReorderBookmarks: (bookmarks: Bookmark[]) => Promise<any>;
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
  rootCollection,
  hasDataAccess,
  location,
  params,
  openNavbar,
  closeNavbar,
  logout,
  onChangeLocation,
  onReorderBookmarks,
  ...props
}: Props) {
  const dispatch = useDispatch();

  const {
    data: trashCollection,
    isLoading,
    error,
  } = useGetCollectionQuery({ id: "trash" });

  const { data: collections = [] } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });

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
    if (trashCollection) {
      const trash: CollectionTreeItem = {
        ...trashCollection,
        id: "trash",
        icon: getCollectionIcon(trashCollection),
        children: [],
      };
      tree.push(trash);
    }

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
  }, [rootCollection, trashCollection, collections, currentUser]);

  const reorderBookmarks = useCallback(
    async ({ newIndex, oldIndex }: { newIndex: number; oldIndex: number }) => {
      const newBookmarks = [...bookmarks];
      const movedBookmark = newBookmarks[oldIndex];

      newBookmarks.splice(oldIndex, 1);
      newBookmarks.splice(newIndex, 0, movedBookmark);

      await onReorderBookmarks(newBookmarks);
    },
    [bookmarks, onReorderBookmarks],
  );

  const onCreateNewCollection = useCallback(() => {
    dispatch(setOpenModal("collection"));
  }, [dispatch]);

  const allError = props.allError || !!error;
  if (allError) {
    return <NavbarErrorView />;
  }

  const allFetched = props.allFetched && !isLoading;
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
        selectedItems={selectedItems}
        hasDataAccess={hasDataAccess}
        reorderBookmarks={reorderBookmarks}
        handleCreateNewCollection={onCreateNewCollection}
        handleCloseNavbar={closeNavbar}
        handleLogout={logout}
      />
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
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(memo(MainNavbarContainer));
