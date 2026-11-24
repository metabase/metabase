import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import {
  CollectionPermissionsHelp,
  type PermissionEditorEntity,
  PermissionsSidebar,
  assertNumericId,
  collectionsQuery,
  getCollectionEntity,
  getCollectionsPermissionEditor,
  getCollectionsSidebar,
  getIsCollectionPermissionsDirty,
  initializeCollectionPermissions,
  loadCollectionPermissions,
  saveCollectionPermissions,
  updateCollectionPermission,
} from "metabase/permissions";
import { useDispatch, useSelector } from "metabase/redux";
import type { CollectionTreeItem } from "metabase/redux/store";
import { useNavigate, useParams } from "metabase/router";
import type { Collection, CollectionId } from "metabase-types/api";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsPageLayout } from "../../components/PermissionsPageLayout";

// PROTOTYPE: the pseudo folder grouping official (git-synced) collections in
// the sidebar. It has no permissions of its own, so selecting it shows the
// empty state.
const OFFICIAL_COLLECTIONS_ID = "official" as CollectionId;

function flattenCollections(collections: Collection[]): Collection[] {
  return collections.flatMap((collection) => [
    collection,
    ...flattenCollections(collection.children ?? []),
  ]);
}

/**
 * PROTOTYPE: the sidebar with the prototype's names: the Library is "Semantic
 * layer" (and its data section "Datasets"), the root collection is
 * "Collections", and with git integration on the top-level collections split
 * into "Official collections" (synced) and "Collections" (the rest), both
 * expandable.
 */
function reshapeCollectionsTree(
  tree: CollectionTreeItem[],
  rawCollections: Collection[],
  isGitIntegrationEnabled: boolean,
): CollectionTreeItem[] {
  const collectionsById = new Map(
    flattenCollections(rawCollections).map((collection) => [
      collection.id,
      collection,
    ]),
  );
  const renameLibraryItems = (items: CollectionTreeItem[]) =>
    items.map((item): CollectionTreeItem => {
      const collection = collectionsById.get(item.id);
      const children = item.children && renameLibraryItems(item.children);
      if (collection?.type === "library") {
        return {
          ...item,
          name: t`Semantic layer`,
          icon: isGitIntegrationEnabled ? "grid_2x2_check" : "grid_2x2",
          children,
        };
      }
      if (
        collection?.type === "library-data" &&
        collection.is_library_root === true
      ) {
        return { ...item, name: t`Datasets`, children };
      }
      return { ...item, children };
    });

  const renamed = renameLibraryItems(tree);
  const isLibraryItem = (item: CollectionTreeItem) =>
    collectionsById.get(item.id)?.type === "library";
  const libraryItems = renamed.filter(isLibraryItem);
  // Usage analytics lives in Monitor in the prototype, so it's left out here.
  const topLevelItems = renamed.filter(
    (item) =>
      !isLibraryItem(item) &&
      item.id !== "root" &&
      !isInstanceAnalyticsCollection(collectionsById.get(item.id)),
  );
  const rootItem = renamed.find((item) => item.id === "root");
  const collectionsItem: CollectionTreeItem | undefined = rootItem && {
    ...rootItem,
    name: t`Collections`,
  };

  if (!isGitIntegrationEnabled) {
    return [
      ...libraryItems,
      ...(collectionsItem ? [collectionsItem] : []),
      ...topLevelItems,
    ];
  }

  const isOfficial = (item: CollectionTreeItem) =>
    collectionsById.get(item.id)?.is_remote_synced === true;
  return [
    ...libraryItems,
    {
      id: OFFICIAL_COLLECTIONS_ID,
      name: t`Official collections`,
      icon: "folder_bookmark",
      children: topLevelItems.filter(isOfficial),
    },
    ...(collectionsItem
      ? [
          {
            ...collectionsItem,
            children: topLevelItems.filter((item) => !isOfficial(item)),
          },
        ]
      : []),
  ];
}

export function CollectionPermissionsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { data: rawCollections } =
    useListCollectionsTreeQuery(collectionsQuery);
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();

  // These selectors resolve the selected collection from the route, so they
  // take the route params rather than reading them from the store.
  const params = useParams<{ collectionId: string }>();
  const selectorProps = { params };
  const baseSidebar = useSelector((state) =>
    getCollectionsSidebar(state, selectorProps),
  );
  const sidebar = useMemo(
    () => ({
      ...baseSidebar,
      selectedId:
        params.collectionId === OFFICIAL_COLLECTIONS_ID
          ? OFFICIAL_COLLECTIONS_ID
          : baseSidebar.selectedId,
      entityGroups: baseSidebar.entityGroups.map((group) =>
        reshapeCollectionsTree(
          group,
          rawCollections ?? [],
          isGitIntegrationEnabled,
        ),
      ),
    }),
    [baseSidebar, params.collectionId, rawCollections, isGitIntegrationEnabled],
  );
  const permissionEditor = useSelector((state) =>
    getCollectionsPermissionEditor(state, selectorProps),
  );
  const collection = useSelector((state) =>
    getCollectionEntity(state, selectorProps),
  );
  const isDirty = useSelector(getIsCollectionPermissionsDirty);

  const originalPermissionsState = useSelector(
    ({ admin }) => admin.permissions.originalCollectionPermissions,
  );

  // These thunks take a collection namespace; this page edits the default one.
  useEffect(() => {
    dispatch(initializeCollectionPermissions(undefined));
  }, [dispatch]);

  const navigateToItem = ({ id }: { id: CollectionId }) =>
    navigate(`${getPermissionsBasePath()}/collections/${id}`);

  const handlePermissionChange = useCallback(
    (
      item: PermissionEditorEntity,
      _permission: unknown,
      value: unknown,
      toggleState: boolean | null,
    ) => {
      if (!collection) {
        return;
      }
      dispatch(
        updateCollectionPermission({
          groupId: assertNumericId(item.id),
          collection,
          value,
          shouldPropagateToChildren: toggleState,
          originalPermissionsState,
        }),
      );
    },
    [collection, dispatch, originalPermissionsState],
  );

  return (
    <PermissionsPageLayout
      tab="collections"
      isDirty={isDirty}
      onSave={() => dispatch(saveCollectionPermissions(undefined))}
      onLoad={() => dispatch(loadCollectionPermissions(undefined))}
      helpContent={<CollectionPermissionsHelp />}
      key={collection?.id}
    >
      <PermissionsSidebar {...sidebar} onSelect={navigateToItem} />

      {!permissionEditor && (
        <PermissionsEditorEmptyState
          icon="folder"
          message={t`Select a collection to see its permissions`}
        />
      )}

      {permissionEditor && (
        <PermissionsEditor
          isLoading={undefined}
          error={undefined}
          {...permissionEditor}
          onChange={handlePermissionChange}
        />
      )}
    </PermissionsPageLayout>
  );
}
