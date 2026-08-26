import { useCallback, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isPersonalCollectionChild } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import { ModalContent } from "metabase/common/components/ModalContent";
import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { Button } from "metabase/ui";
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
  getIsDirty,
} from "../../selectors/collection-permissions";
import type { PermissionEditorEntity, PermissionEditorType } from "../../types";
import { assertNumericId } from "../../types";
import { PermissionsTable } from "../PermissionsTable";

import S from "./CollectionPermissionsModal.module.css";

const getDefaultTitle = (namespace?: CollectionNamespace) =>
  namespace === "snippets"
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
    isDirty: getIsDirty(state),
  };
};

const mapDispatchToProps = {
  initialize: initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
};

interface CollectionPermissionsModalProps {
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

const CollectionPermissionsModal = ({
  permissionEditor,
  isDirty,
  onClose,
  namespace = null,
  collection,

  initialize,
  updateCollectionPermission,
  saveCollectionPermissions,
}: CollectionPermissionsModalProps) => {
  const { data: collectionsList } =
    useListCollectionsTreeQuery(collectionsQuery);

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
        ...(namespace === "snippets"
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(connect(mapStateToProps, mapDispatchToProps))(
  CollectionPermissionsModal,
);
