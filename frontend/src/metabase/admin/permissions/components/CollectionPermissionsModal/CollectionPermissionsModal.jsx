import React, { useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import * as Urls from "metabase/lib/urls";

import Collections from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";

import { isPersonalCollectionChild } from "metabase/collections/utils";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

import { PermissionsTable } from "../PermissionsTable";
import Groups from "metabase/entities/groups";
import {
  getDiff,
  getIsDirty,
  getCollectionsPermissionEditor,
} from "../../selectors/collection-permissions";
import {
  initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
} from "../../permissions";
import { permissionEditorPropTypes } from "../PermissionsEditor/PermissionsEditor";

const getDefaultTitle = namespace =>
  namespace === "snippets"
    ? t`Permissions for this folder`
    : t`Permissions for this collection`;

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
      footer={[
        ...(namespace === "snippets"
          ? []
          : [
              <Link
                key="all-permissions"
                className="link"
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
      <div className="relative" style={{ height: "50vh" }}>
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

CollectionPermissionsModal.propTypes = propTypes;

const getCollectionEntity = props =>
  props.namespace === "snippets" ? SnippetCollections : Collections;

const mapStateToProps = (state, props) => {
  const collectionId = Urls.extractCollectionId(props.params.slug);
  return {
    permissionEditor: getCollectionsPermissionEditor(state, {
      namespace: props.namespace,
      params: { collectionId },
    }),
    collection: getCollectionEntity(props).selectors.getObject(state, {
      entityId: collectionId,
    }),
    collectionsList: Collections.selectors.getList(state, {
      entityQuery: { tree: true },
    }),
    diff: getDiff(state, props),
    isDirty: getIsDirty(state, props),
  };
};

const mapDispatchToProps = {
  initialize: initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
};

export default _.compose(
  Collections.loadList({
    query: () => ({ tree: true }),
  }),
  Groups.loadList(),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(CollectionPermissionsModal);
