import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { CollectionPermissionsHelp } from "metabase/admin/permissions/components/CollectionPermissionsHelp";
import { useListCollectionsTreeQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { push, useParams } from "metabase/router";
import type { CollectionId } from "metabase-types/api";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsPageLayout } from "../../components/PermissionsPageLayout";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";
import {
  initializeCollectionPermissions,
  loadCollectionPermissions,
  saveCollectionPermissions,
  updateCollectionPermission,
} from "../../permissions";
import {
  collectionsQuery,
  getCollectionEntity,
  getCollectionsPermissionEditor,
  getCollectionsSidebar,
  getIsDirty,
} from "../../selectors/collection-permissions";
import type { PermissionEditorEntity } from "../../types";
import { assertNumericId } from "../../types";

export function CollectionPermissionsPage() {
  const dispatch = useDispatch();
  useListCollectionsTreeQuery(collectionsQuery);

  // These selectors resolve the selected collection from the route, so they
  // take the route params rather than reading them from the store.
  const params = useParams<{ collectionId: string }>();
  const selectorProps = { params };
  const sidebar = useSelector((state) =>
    getCollectionsSidebar(state, selectorProps),
  );
  const permissionEditor = useSelector((state) =>
    getCollectionsPermissionEditor(state, selectorProps),
  );
  const collection = useSelector((state) =>
    getCollectionEntity(state, selectorProps),
  );
  const isDirty = useSelector(getIsDirty);

  const originalPermissionsState = useSelector(
    ({ admin }) => admin.permissions.originalCollectionPermissions,
  );

  // These thunks take a collection namespace; this page edits the default one.
  useEffect(() => {
    dispatch(initializeCollectionPermissions(undefined));
  }, [dispatch]);

  const navigateToItem = ({ id }: { id: CollectionId }) =>
    dispatch(push(`/admin/permissions/collections/${id}`));

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
