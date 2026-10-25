import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useListCollectionsQuery,
  useListCollectionsTreeQuery,
  useListPermissionsGroupsQuery,
} from "metabase/api";
import { isPersonalCollectionChild } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import { ModalContent } from "metabase/common/components/ModalContent";
import CS from "metabase/css/core/index.css";
import { Button, Modal } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CollectionId,
  CollectionNamespace,
} from "metabase-types/api";

import { useCollectionPermissionsGraph } from "../../hooks/use-collection-permissions-graph";
import type { PermissionEditorEntity } from "../../types";
import { assertNumericId } from "../../types";
import {
  collectionsQuery,
  getCollectionsPermissionEditor,
  getPermissionsCollection,
  isFolderNamespace,
} from "../../utils/collection-permissions/editor";
import { PermissionsTable } from "../PermissionsTable";

import S from "./CollectionPermissionsModal.module.css";

const getDefaultTitle = (namespace?: CollectionNamespace) =>
  isFolderNamespace(namespace)
    ? t`Permissions for this folder`
    : t`Permissions for this collection`;

type CollectionPermissionsModalBodyProps = {
  collectionId: CollectionId | undefined;
  namespace?: CollectionNamespace;
  onClose: () => void;
};

const useModalCollection = (
  collectionId: CollectionId | undefined,
  namespace?: CollectionNamespace,
) => {
  const isFolder = isFolderNamespace(namespace);
  const { data: collections } = useListCollectionsTreeQuery(
    isFolder ? skipToken : collectionsQuery,
  );
  const { data: folders } = useListCollectionsQuery(
    isFolder && namespace != null ? { namespace } : skipToken,
  );

  const collection = useMemo(() => {
    if (collectionId == null) {
      return undefined;
    }
    if (isFolder) {
      return folders?.find((folder) => folder.id === collectionId);
    }
    return collections && getPermissionsCollection(collections, collectionId);
  }, [collectionId, collections, folders, isFolder]);

  return { collection, collections };
};

const isHiddenFromPermissions = (
  collection: Collection,
  collections: Collection[] | undefined,
) =>
  collection.archived ||
  collection.personal_owner_id != null ||
  (collections != null && isPersonalCollectionChild(collection, collections));

const CollectionPermissionsModalBody = ({
  collectionId,
  namespace = null,
  onClose,
}: CollectionPermissionsModalBodyProps) => {
  const { collection, collections } = useModalCollection(
    collectionId,
    namespace,
  );
  const { data: groups } = useListPermissionsGroupsQuery({});
  const { permissions, isDirty, updatePermission, savePermissions } =
    useCollectionPermissionsGraph(namespace);

  const permissionEditor = useMemo(
    () =>
      permissions && collection && groups
        ? getCollectionsPermissionEditor({
            permissions,
            collection,
            groups,
            namespace,
          })
        : null,
    [permissions, collection, groups, namespace],
  );

  useEffect(() => {
    if (collection && isHiddenFromPermissions(collection, collections)) {
      onClose();
    }
  }, [collections, collection, onClose]);

  const handleSave = async () => {
    if (await savePermissions()) {
      onClose();
    }
  };

  const modalTitle = collection?.name
    ? t`Permissions for ${collection.name}`
    : getDefaultTitle(namespace);

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
      updatePermission({
        groupId: assertNumericId(item.id),
        collection,
        value,
        shouldPropagateToChildren: toggleState,
      });
    },
    [collection, updatePermission],
  );

  return (
    <ModalContent
      title={modalTitle}
      onClose={onClose}
      className={CS.overflowHidden}
      footer={[
        ...(isFolderNamespace(namespace)
          ? []
          : [
              <Link
                key="all-permissions"
                className={CS.link}
                to="/admin/permissions/collections"
              >
                {t`See all collection permissions`}
              </Link>,
            ]),
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="save"
          variant="filled"
          disabled={!isDirty}
          onClick={handleSave}
        >
          {t`Save`}
        </Button>,
      ]}
    >
      <div className={S.PermissionTableContainer}>
        {permissionEditor && (
          <PermissionsTable
            {...permissionEditor}
            onChange={handlePermissionChange}
          />
        )}
      </div>
    </ModalContent>
  );
};

type CollectionPermissionsModalProps = {
  params: { slug?: string };
  namespace?: CollectionNamespace;
  onClose: () => void;
};

export function CollectionPermissionsModal({
  params,
  namespace,
  onClose,
}: CollectionPermissionsModalProps) {
  return (
    <Modal
      opened
      onClose={onClose}
      withCloseButton={false}
      padding={0}
      size="lg"
    >
      <CollectionPermissionsModalBody
        collectionId={Urls.extractCollectionId(params.slug)}
        namespace={namespace}
        onClose={onClose}
      />
    </Modal>
  );
}
