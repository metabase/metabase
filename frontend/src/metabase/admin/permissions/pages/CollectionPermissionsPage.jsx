/* eslint-disable react/prop-types */
import React, { useEffect, useState } from "react";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Groups from "metabase/entities/groups";
import Collections from "metabase/entities/collections";

import {
  updatePermission,
  savePermissions,
  loadPermissions,
} from "../permissions";
import { PermissionEditor } from "../components/permission-editor/PermissionEditor";
import CollectionsSidebar from "../components/collections-sidebar/CollectionsSidebar";
import { COLLECTION_OPTIONS } from "../constants/collections-permissions";
import { CollectionsApi } from "metabase/services";
import { PermissionEditorEmptyState } from "../components/permission-editor/PermissionEditorEmptyState";
import { PermissionsPageLayout } from "../components/permissions-page-layout/PermissionsPageLayout";

function CollectionsPermissionsPage({
  groups,
  params,
  onChangeTab,
  collection,
}) {
  const [graph, setGraph] = useState(null);

  useEffect(() => {
    const fetchGraph = async () => {
      const graph = await CollectionsApi.graph();
      setGraph(graph);
    };

    fetchGraph();
  }, []);

  const entities =
    graph == null || params.collectionId == null
      ? []
      : groups.map(group => {
          return {
            ...group,
            permissions: {
              access: {
                value: graph.groups[group.id][params.collectionId],
              },
            },
          };
        });

  return (
    <PermissionsPageLayout tab="collections" onChangeTab={onChangeTab}>
      <CollectionsSidebar selectedId={params.collectionId} />
      {collection == null ? (
        <PermissionEditorEmptyState
          icon="group"
          message={t`Select a group to see it's data permissions`}
        />
      ) : (
        <PermissionEditor
          title={t`Permissions for ${collection.name}`}
          filterPlaceholder={t`Search groups`}
          entities={entities}
          permissions={COLLECTION_OPTIONS}
          entityName={t`Group name`}
        />
      )}
    </PermissionsPageLayout>
  );
}

const mapStateToProps = (state, props) => {
  return {
    collection: props.params.collectionId
      ? state.entities.collections[props.params.collectionId]
      : null,
  };
};

const mapDispatchToProps = {
  onUpdatePermission: updatePermission,
  onSave: savePermissions,
  onCancel: loadPermissions,
  onChangeTab: tab => push(`/admin/permissions/${tab}`),
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
)(CollectionsPermissionsPage);
