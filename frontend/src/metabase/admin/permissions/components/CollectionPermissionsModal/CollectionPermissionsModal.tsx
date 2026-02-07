import type { ReactElement } from "react";
import { useCallback, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import { isPersonalCollectionChild } from "metabase/collections/utils";
import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";
import { ModalContent } from "metabase/common/components/ModalContent";
import CS from "metabase/css/core/index.css";
import { Collections } from "metabase/entities/collections";
import { Groups } from "metabase/entities/groups";
import { connect, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Collection, CollectionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
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
import type { PermissionEditorType } from "../PermissionsEditor";
import { PermissionsTable } from "../PermissionsTable";

import S from "./CollectionPermissionsModal.module.css";

const getDefaultTitle = (namespace?: string) =>
  namespace === "snippets"
    ? t`Permissions for this folder`
    : t`Permissions for this collection`;

interface OwnProps {
  params: { slug: string };
  namespace?: string;
  onClose: () => void;
}

interface StateProps {
  permissionEditor?: PermissionEditorType;
  collection?: Collection;
  collectionsList?: Collection[];
  isDirty: boolean;
}

interface DispatchProps {
  initialize: typeof initializeCollectionPermissions;
  updateCollectionPermission: typeof updateCollectionPermission;
  saveCollectionPermissions: typeof saveCollectionPermissions;
}

type CollectionPermissionsModalProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State, props: OwnProps): StateProps => {
  const collectionId = Urls.extractCollectionId(props.params.slug);
  return {
    permissionEditor: getCollectionsPermissionEditor(state, {
      namespace: props.namespace,
      params: { collectionId },
    }),
    collection: getCollectionEntity(state, {
      params: { collectionId },
      namespace: props.namespace,
    }),
    collectionsList: Collections.selectors.getList(state, {
      entityQuery: { tree: true },
    }),
    isDirty: getIsDirty(state, props),
  };
};

const mapDispatchToProps: DispatchProps = {
  initialize: initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
};

const CollectionPermissionsModalComponent = ({
  permissionEditor,
  isDirty,
  onClose,
  namespace,
  collection,
  collectionsList,

  initialize,
  updateCollectionPermission,
  saveCollectionPermissions,
}: CollectionPermissionsModalProps) => {
  const originalPermissionsState = useSelector(
    ({ admin }: State) => admin.permissions.originalCollectionPermissions,
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
    (item: any, _permission: any, value: any, toggleState: any) => {
      updateCollectionPermission({
        groupId: item.id,
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
          : ([
              <Link
                key="all-permissions"
                className={CS.link}
                to="/admin/permissions/collections"
              >
                {t`See all collection permissions`}
              </Link>,
            ] as ReactElement[])),
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button key="save" primary disabled={!isDirty} onClick={handleSave}>
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

export const CollectionPermissionsModal = _.compose(
  Collections.loadList({
    entityQuery: collectionsQuery,
  }),
  Groups.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionPermissionsModalComponent);
