import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
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
import { useNavigate, useParams } from "metabase/router";
import type { CollectionId } from "metabase-types/api";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsPageLayout } from "../../components/PermissionsPageLayout";

export function CollectionPermissionsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
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
