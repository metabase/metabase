import { useCallback, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useListCollectionsQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { isPersonalCollectionChild } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import { ModalContent } from "metabase/common/components/ModalContent";
import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { Button, Modal } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection, CollectionNamespace } from "metabase-types/api";

import {
  type UpdateCollectionPermissionParams,
  initializeCollectionPermissions,
  saveCollectionPermissions,
  updateCollectionPermission,
} from "../../permissions";
import {
  collectionsQuery,
  getCollectionEntity,
  getCollectionsPermissionEditor,
  getIsCollectionPermissionsDirty,
} from "../../selectors/collection-permissions";
import type { PermissionEditorEntity, PermissionEditorType } from "../../types";
import { assertNumericId } from "../../types";
import { PermissionsTable } from "../PermissionsTable";

import S from "./CollectionPermissionsModal.module.css";

const isFolderNamespace = (namespace?: CollectionNamespace) =>
  namespace === "snippets" || namespace === "data-actions";

const getDefaultTitle = (namespace?: CollectionNamespace) =>
  isFolderNamespace(namespace)
    ? t`Permissions for this folder`
    : t`Permissions for this collection`;

const mapStateToProps = (
  state: State,
  props: { params: { slug?: string }; namespace?: CollectionNamespace },
) => {
  const collectionId = Urls.extractCollectionId(props.params.slug);
  if (!collectionId) {
    return {
      permissionEditor: null,
      isDirty: false,
    };
  }
  return {
    permissionEditor: getCollectionsPermissionEditor(state, {
      namespace: props.namespace,
      params: { collectionId },
    }),
    collection: getCollectionEntity(state, {
      params: { collectionId },
      namespace: props.namespace,
    }),
    isDirty: getIsCollectionPermissionsDirty(state),
  };
};

const mapDispatchToProps = {
  initialize: initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
};

interface CollectionPermissionsModalBodyProps {
  permissionEditor: PermissionEditorType | null;
  isDirty: boolean;
  onClose: () => void;
  namespace?: CollectionNamespace;
  collection?: Collection;
  initialize: (namespace: CollectionNamespace) => void;
  updateCollectionPermission: (
    params: UpdateCollectionPermissionParams,
  ) => void;
  saveCollectionPermissions: (namespace: CollectionNamespace) => void;
}

const CollectionPermissionsModalBody = ({
  permissionEditor,
  isDirty,
  onClose,
  namespace = null,
  collection,

  initialize,
  updateCollectionPermission,
  saveCollectionPermissions,
}: CollectionPermissionsModalBodyProps) => {
  const { data: collectionsList } =
    useListCollectionsTreeQuery(collectionsQuery);
  useListCollectionsQuery(namespace != null ? { namespace } : skipToken);

  const originalPermissionsState = useSelector(
    ({ admin }) => admin.permissions.originalCollectionPermissions,
  );
  useEffect(() => {
    initialize(namespace);
  }, [initialize, namespace]);

  useEffect(() => {
    const isPersonalCollectionLoaded =
      collection &&
      Array.isArray(collectionsList) &&
      (collection.personal_owner_id ||
        isPersonalCollectionChild(collection, collectionsList));

    if (isPersonalCollectionLoaded || collection?.archived) {
      onClose();
    }
  }, [collectionsList, collection, onClose]);

  const handleSave = async () => {
    await saveCollectionPermissions(namespace);
    onClose();
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
      updateCollectionPermission({
        groupId: assertNumericId(item.id),
        collection,
        value,
        shouldPropagateToChildren: toggleState,
        originalPermissionsState,
      });
    },
    [collection, updateCollectionPermission, originalPermissionsState],
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

const ConnectedCollectionPermissionsModalBody = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionPermissionsModalBody);

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
      <ConnectedCollectionPermissionsModalBody
        params={params}
        namespace={namespace}
        onClose={onClose}
      />
    </Modal>
  );
}
