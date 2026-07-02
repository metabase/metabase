import type { LocationDescriptor } from "history";
import { memo, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useGetCollectionQuery,
  useListBookmarksQuery,
  useListCollectionsTreeQuery,
  useListDatabasesQuery,
  useReorderBookmarksMutation,
} from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import CreateCollectionModal from "metabase/common/collections/containers/CreateCollectionModal";
import type { CollectionTreeItem } from "metabase/common/collections/utils";
import {
  buildCollectionTree,
  currentUserPersonalCollections,
  getCollectionIcon,
  nonPersonalOrArchivedCollection,
} from "metabase/common/collections/utils";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { logout } from "metabase/redux/auth";
import type { State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import {
  getIsTenantUser,
  getUser,
  getUserCanWriteToCollections,
} from "metabase/selectors/user";
import { Modal } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection, User } from "metabase-types/api";

import { NavbarErrorView } from "../NavbarErrorView";
import { NavbarLoadingView } from "../NavbarLoadingView";
import type { MainNavbarProps, SelectedItem } from "../types";

import { MainNavbarView } from "./MainNavbarView";

type NavbarModal = "MODAL_NEW_COLLECTION" | null;

function mapStateToProps(state: State) {
  return {
    currentUser: getUser(state),
  };
}

const mapDispatchToProps = {
  logout,
};

interface Props extends MainNavbarProps {
  currentUser: User | null;
  selectedItems: SelectedItem[];
  logout: () => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

function MainNavbarContainer({
  selectedItems,
  isOpen,
  currentUser,
  location,
  params,
  openNavbar,
  closeNavbar,
  logout,
  onChangeLocation,
  ...props
}: Props) {
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();
  const hasDataAccess = (databasesResponse?.data.length ?? 0) > 0;
  const [modal, setModal] = useState<NavbarModal>(null);
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);
  const isTenantUser = useSelector(getIsTenantUser);
  const dispatch = useDispatch();

  const { data: bookmarks = [] } = useListBookmarksQuery();
  const [reorderBookmarksMutation] = useReorderBookmarksMutation();

  const { data: rootCollection } = useGetCollectionQuery({
    id: ROOT_COLLECTION.id,
  });

  const {
    data: trashCollection,
    isLoading,
    error,
  } = useGetCollectionQuery(
    {
      id: "trash",
    },
    { skip: !canWriteToCollections },
  );

  const { data: collections = [] } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
    "include-library": true,
  });

  const {
    canAccessTenantSpecificCollections,
    canCreateSharedCollection,
    showExternalCollectionsSection,
    sharedTenantCollections,
  } = PLUGIN_TENANTS.useTenantMainNavbarData();

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser!.id,
    );
    const displayableCollections = collections.filter((collection) =>
      nonPersonalOrArchivedCollection(collection),
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...displayableCollections);

    const tree = buildCollectionTree(preparedCollections, { isTenantUser });
    if (trashCollection) {
      const trash: CollectionTreeItem = {
        ...trashCollection,
        id: "trash",
        icon: getCollectionIcon(trashCollection, { isTenantUser }),
        children: [],
      };
      tree.push(trash);
    }

    if (rootCollection) {
      const root: CollectionTreeItem = {
        ...rootCollection,
        icon: getCollectionIcon(rootCollection, { isTenantUser }),
        children: [],
      };
      return [root, ...tree];
    } else {
      return tree;
    }
  }, [rootCollection, trashCollection, collections, currentUser, isTenantUser]);

  const reorderBookmarks = useCallback(
    async ({ newIndex, oldIndex }: { newIndex: number; oldIndex: number }) => {
      const newBookmarks = [...bookmarks];
      const movedBookmark = newBookmarks[oldIndex];

      newBookmarks.splice(oldIndex, 1);
      newBookmarks.splice(newIndex, 0, movedBookmark);

      const orderings = newBookmarks.map(({ type, item_id }) => ({
        type,
        item_id,
      }));

      try {
        await reorderBookmarksMutation({ orderings }).unwrap();
      } catch (e) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: t`Something went wrong`,
          }),
        );
      }
    },
    [bookmarks, reorderBookmarksMutation, dispatch],
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

  if (error || databasesError) {
    return <NavbarErrorView />;
  }

  if (isLoading || isLoadingDatabases) {
    return <NavbarLoadingView />;
  }

  return (
    <>
      <MainNavbarView
        {...props}
        bookmarks={bookmarks}
        isOpen={isOpen}
        collections={collectionTree}
        selectedItems={selectedItems}
        hasDataAccess={hasDataAccess}
        reorderBookmarks={reorderBookmarks}
        handleCreateNewCollection={onCreateNewCollection}
        handleCloseNavbar={closeNavbar}
        handleLogout={logout}
        sharedTenantCollections={sharedTenantCollections}
        canAccessTenantSpecificCollections={canAccessTenantSpecificCollections}
        canCreateSharedCollection={canCreateSharedCollection}
        showExternalCollectionsSection={showExternalCollectionsSection}
      />

      <Modal
        opened={Boolean(modal)}
        onClose={closeModal}
        size="lg"
        withCloseButton={false}
        padding={0}
      >
        {renderModalContent()}
      </Modal>
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(memo(MainNavbarContainer));
