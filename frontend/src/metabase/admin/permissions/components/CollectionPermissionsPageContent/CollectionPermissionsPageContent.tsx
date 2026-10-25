import { type ComponentProps, useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  useListCollectionsTreeQuery,
  useListPermissionsGroupsQuery,
} from "metabase/api";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import {
  CollectionPermissionsHelp,
  type CollectionSidebarType,
  type PermissionEditorEntity,
  type PermissionEditorType,
  PermissionsSidebar,
  assertNumericId,
  parseCollectionIdParam,
  useCollectionPermissionsGraph,
} from "metabase/permissions";
import { useNavigate, useParams } from "metabase/router";
import type {
  Collection,
  CollectionId,
  CollectionPermissions,
  GroupInfo,
  ListCollectionsTreeRequest,
} from "metabase-types/api";

import { PermissionsEditor } from "../PermissionsEditor";
import { PermissionsEditorEmptyState } from "../PermissionsEditorEmptyState";
import { PermissionsPageLayout } from "../PermissionsPageLayout";

type CollectionPermissionsPageContentProps = {
  tab: ComponentProps<typeof PermissionsPageLayout>["tab"];
  collectionsQuery: ListCollectionsTreeRequest;
  getSidebar: (
    collections: Collection[],
    collectionId: CollectionId | undefined,
  ) => CollectionSidebarType;
  getCollection: (
    collections: Collection[],
    collectionId: CollectionId,
  ) => Collection | undefined;
  getPermissionEditor: (opts: {
    permissions: CollectionPermissions;
    collection: Collection;
    groups: GroupInfo[];
  }) => PermissionEditorType;
  getShouldPropagateToChildren?: (
    toggleState: boolean | null,
  ) => boolean | null;
};

const getToggleState = (toggleState: boolean | null) => toggleState;

export function CollectionPermissionsPageContent({
  tab,
  collectionsQuery,
  getSidebar,
  getCollection,
  getPermissionEditor,
  getShouldPropagateToChildren = getToggleState,
}: CollectionPermissionsPageContentProps) {
  const navigate = useNavigate();
  const params = useParams<{ collectionId: string }>();
  const collectionId = parseCollectionIdParam(params.collectionId);
  const { data: collections } = useListCollectionsTreeQuery(collectionsQuery);
  const { data: groups } = useListPermissionsGroupsQuery({});
  const {
    permissions,
    isDirty,
    saveError,
    updateCollectionPermission,
    savePermissions,
    resetPermissions,
    clearSaveError,
  } = useCollectionPermissionsGraph(collectionsQuery.namespace);

  const sidebar = useMemo(
    () => getSidebar(collections ?? [], collectionId),
    [collections, collectionId, getSidebar],
  );
  const collection = useMemo(
    () =>
      collections && collectionId != null
        ? getCollection(collections, collectionId)
        : undefined,
    [collections, collectionId, getCollection],
  );
  const permissionEditor = useMemo(
    () =>
      permissions && collection && groups
        ? getPermissionEditor({ permissions, collection, groups })
        : null,
    [permissions, collection, groups, getPermissionEditor],
  );

  const navigateToItem = ({ id }: { id: CollectionId }) =>
    navigate(`${getPermissionsBasePath()}/${tab}/${id}`);

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
      updateCollectionPermission({
        groupId: assertNumericId(item.id),
        collection,
        value,
        shouldPropagateToChildren: getShouldPropagateToChildren(toggleState),
      });
    },
    [collection, updateCollectionPermission, getShouldPropagateToChildren],
  );

  return (
    <PermissionsPageLayout
      tab={tab}
      isDirty={isDirty}
      onSave={savePermissions}
      onCancel={resetPermissions}
      saveError={saveError}
      onClearSaveError={clearSaveError}
      helpContent={<CollectionPermissionsHelp />}
    >
      <PermissionsSidebar {...sidebar} onSelect={navigateToItem} />

      {permissionEditor ? (
        <PermissionsEditor
          key={collection?.id}
          {...permissionEditor}
          onChange={handlePermissionChange}
        />
      ) : (
        <PermissionsEditorEmptyState
          icon="folder"
          message={t`Select a collection to see its permissions`}
        />
      )}
    </PermissionsPageLayout>
  );
}
