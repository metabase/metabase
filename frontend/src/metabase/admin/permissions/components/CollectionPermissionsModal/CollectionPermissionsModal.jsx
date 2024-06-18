import PropTypes from "prop-types";
import { useEffect, useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { isPersonalCollectionChild } from "metabase/collections/utils";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import Collections from "metabase/entities/collections";
import Groups from "metabase/entities/groups";
import * as Urls from "metabase/lib/urls";

import {
  initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
} from "../../permissions";
import {
  getIsDirty,
  getCollectionsPermissionEditor,
  collectionsQuery,
  getCollectionEntity,
} from "../../selectors/collection-permissions";
import { permissionEditorPropTypes } from "../PermissionsEditor";
import { PermissionsTable } from "../PermissionsTable";

import { PermissionTableContainer } from "./CollectionPermissionsModal.styled";

const getDefaultTitle = namespace =>
  namespace === "snippets"
    ? t`Permissions for this folder`
    : t`Permissions for this collection`;

const mapStateToProps = (state, props) => {
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

const mapDispatchToProps = {
  initialize: initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
};

const propTypes = {
  permissionEditor: PropTypes.shape(permissionEditorPropTypes),
  namespace: PropTypes.string,
  isDirty: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  collection: PropTypes.object,
  collectionsList: PropTypes.arrayOf(PropTypes.object),
  initialize: PropTypes.func.isRequired,
  updateCollectionPermission: PropTypes.func.isRequired,
  saveCollectionPermissions: PropTypes.func.isRequired,
};

const CollectionPermissionsModal = ({
  permissionEditor,
  isDirty,
  onClose,
  namespace,
  collection,
  collectionsList,

  initialize,
  updateCollectionPermission,
  saveCollectionPermissions,
}) => {
  useEffect(() => {
    initialize(namespace);
  }, [initialize, namespace]);

  useEffect(() => {
    const isPersonalCollectionLoaded =
      collection &&
      Array.isArray(collectionsList) &&
      (collection.personal_owner_id ||
        isPersonalCollectionChild(collection, collectionsList));

    if (isPersonalCollectionLoaded || collection.archived) {
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
    (item, _permission, value, toggleState) => {
      updateCollectionPermission({
        groupId: item.id,
        collection,
        value,
        shouldPropagate: toggleState,
      });
    },
    [collection, updateCollectionPermission],
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
        <Button key="save" primary disabled={!isDirty} onClick={handleSave}>
          {t`Save`}
        </Button>,
      ]}
    >
      <PermissionTableContainer>
        {permissionEditor && (
          <PermissionsTable
            {...permissionEditor}
            onChange={handlePermissionChange}
          />
        )}
      </PermissionTableContainer>
    </ModalContent>
  );
};

CollectionPermissionsModal.propTypes = propTypes;

export default _.compose(
  Collections.loadList({
    entityQuery: collectionsQuery,
  }),
  Groups.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionPermissionsModal);
