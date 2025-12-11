import { useCallback } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCollectionPermissionsEditor } from "metabase/admin/permissions/hooks/useCollectionPermissionsEditor";
import { useCollectionPermissionsSidebar } from "metabase/admin/permissions/hooks/useCollectionPermissionsSidebar";
import { useCollectionPermissionsState } from "metabase/admin/permissions/hooks/useCollectionPermissionsState";
import { useSelectedCollection } from "metabase/admin/permissions/hooks/useSelectedCollection";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { useDispatch } from "metabase/lib/redux";
import type { CollectionId, GroupId } from "metabase-types/api";

import { CollectionPermissionsHelp } from "../../components/CollectionPermissionsHelp";
import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsPageLayout } from "../../components/PermissionsPageLayout";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";

import { getDefaultCollectionPermissionsConfig } from "./config";
import type { CollectionIdProps, CollectionPermissionsConfig } from "./types";

type Props = {
  params: CollectionIdProps["params"];
  route: Route;
  config?: CollectionPermissionsConfig;
};

function parseCollectionId(
  collectionId: string | number | undefined,
): CollectionId | undefined {
  if (collectionId === undefined || collectionId === null) {
    return undefined;
  }
  if (collectionId === ROOT_COLLECTION.id || collectionId === "root") {
    return ROOT_COLLECTION.id;
  }
  return typeof collectionId === "number"
    ? collectionId
    : parseInt(String(collectionId), 10);
}

export function CollectionPermissionsPage({
  params,
  route,
  config = getDefaultCollectionPermissionsConfig(),
}: Props) {
  const dispatch = useDispatch();
  const collectionId = parseCollectionId(params.collectionId);

  // Main permissions state
  const {
    permissions,
    groups,
    isLoading,
    isDirty,
    updatePermission,
    savePermissions,
    discardChanges,
  } = useCollectionPermissionsState(config);

  // Sidebar data
  const { sidebar } = useCollectionPermissionsSidebar(config, collectionId);

  // Selected collection
  const collection = useSelectedCollection(
    config.collectionsQuery,
    collectionId,
    config.rootCollectionName,
  );

  // Permission editor data
  const permissionEditor = useCollectionPermissionsEditor(
    config,
    collection,
    groups,
    permissions,
  );

  // Navigation handler
  const handleSelectCollection = useCallback(
    (item: { id: CollectionId }) => {
      dispatch(push(`${config.navigationBasePath}/${item.id}`));
    },
    [dispatch, config.navigationBasePath],
  );

  // Permission change handler
  const handlePermissionChange = useCallback(
    (
      item: { id: GroupId },
      _permission: unknown,
      value: string,
      toggleState: boolean | null,
    ) => {
      if (!collection) {
        return;
      }

      updatePermission({
        groupId: item.id,
        collectionId: collection.id,
        value,
        shouldPropagate: toggleState ?? false,
        collection,
      });
    },
    [collection, updatePermission],
  );

  return (
    <PermissionsPageLayout
      tab={config.tab}
      isDirty={isDirty}
      route={route}
      onSave={savePermissions}
      onLoad={discardChanges}
      helpContent={<CollectionPermissionsHelp />}
    >
      {isLoading ? (
        <PermissionsEditorEmptyState icon="folder" message={t`Loading...`} />
      ) : (
        <>
          <PermissionsSidebar {...sidebar} onSelect={handleSelectCollection} />

          {!permissionEditor && (
            <PermissionsEditorEmptyState
              icon="folder"
              message={t`Select a collection to see its permissions`}
            />
          )}

          {permissionEditor && (
            <PermissionsEditor
              isLoading={false}
              error={undefined}
              {...permissionEditor}
              onChange={handlePermissionChange}
            />
          )}
        </>
      )}
    </PermissionsPageLayout>
  );
}
