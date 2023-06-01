import { useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Groups from "metabase/entities/groups";
import Collections from "metabase/entities/collections";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
  permissionEditorPropTypes,
} from "../../components/PermissionsEditor";
import PermissionsPageLayout from "../../components/PermissionsPageLayout";
import {
  initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
  loadCollectionPermissions,
} from "../../permissions";
import {
  getCollectionsSidebar,
  getCollectionsPermissionEditor,
  getCollectionEntity,
  getIsDirty,
  collectionsQuery,
} from "../../selectors/collection-permissions";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";

const mapDispatchToProps = {
  initialize: initializeCollectionPermissions,
  loadPermissions: loadCollectionPermissions,
  navigateToItem: ({ id }) => push(`/admin/permissions/collections/${id}`),
  updateCollectionPermission,
  savePermissions: saveCollectionPermissions,
};

const mapStateToProps = (state, props) => {
  return {
    sidebar: getCollectionsSidebar(state, props),
    permissionEditor: getCollectionsPermissionEditor(state, props),
    isDirty: getIsDirty(state, props),
    collection: getCollectionEntity(state, props),
  };
};

const propTypes = {
  params: PropTypes.shape({
    collectionId: PropTypes.string,
  }),
  children: PropTypes.node.isRequired,
  sidebar: PropTypes.object,
  permissionEditor: PropTypes.shape(permissionEditorPropTypes),
  collection: PropTypes.object,
  navigateToItem: PropTypes.func.isRequired,
  updateCollectionPermission: PropTypes.func.isRequired,
  isDirty: PropTypes.bool,
  savePermissions: PropTypes.func.isRequired,
  loadPermissions: PropTypes.func.isRequired,
  initialize: PropTypes.func.isRequired,
  route: PropTypes.object,
};

function CollectionsPermissionsPage({
  sidebar,
  permissionEditor,
  collection,
  isDirty,
  savePermissions,
  loadPermissions,
  updateCollectionPermission,
  navigateToItem,
  initialize,
  route,
}) {
  useEffect(() => {
    initialize();
  }, [initialize]);

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
    <PermissionsPageLayout
      tab="collections"
      isDirty={isDirty}
      route={route}
      onSave={savePermissions}
      onLoad={() => loadPermissions()}
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
          {...permissionEditor}
          onChange={handlePermissionChange}
        />
      )}
    </PermissionsPageLayout>
  );
}

CollectionsPermissionsPage.propTypes = propTypes;

export default _.compose(
  Collections.loadList({
    entityQuery: collectionsQuery,
  }),
  Groups.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionsPermissionsPage);
