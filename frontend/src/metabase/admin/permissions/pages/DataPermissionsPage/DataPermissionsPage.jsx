import React, { useEffect } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { connect } from "react-redux";

import Tables from "metabase/entities/tables";
import Groups from "metabase/entities/groups";
import Databases from "metabase/entities/databases";

import { getIsDirty, getDiff } from "../../selectors/data-permissions/diff";
import {
  saveDataPermissions,
  loadDataPermissions,
  initializeDataPermissions,
} from "../../permissions";
import PermissionsPageLayout from "../../components/PermissionsPageLayout/PermissionsPageLayout";
import { DataPermissionsHelp } from "../../components/DataPermissionsHelp";
import ToolbarUpsell from "../../components/ToolbarUpsell";

export const DATA_PERMISSIONS_TOOLBAR_CONTENT = [
  <ToolbarUpsell key="upsell" />,
];

const mapDispatchToProps = {
  loadPermissions: loadDataPermissions,
  savePermissions: saveDataPermissions,
  initialize: initializeDataPermissions,
  fetchTables: dbId =>
    Tables.actions.fetchList({
      dbId,
      include_hidden: true,
    }),
};

const mapStateToProps = (state, props) => ({
  isDirty: getIsDirty(state, props),
  diff: getDiff(state, props),
});

const propTypes = {
  children: PropTypes.node.isRequired,
  isDirty: PropTypes.bool,
  diff: PropTypes.object,
  savePermissions: PropTypes.func.isRequired,
  loadPermissions: PropTypes.func.isRequired,
  initialize: PropTypes.func.isRequired,
  route: PropTypes.object,
  params: PropTypes.shape({
    databaseId: PropTypes.string,
  }),
  fetchTables: PropTypes.func,
};

function DataPermissionsPage({
  children,
  isDirty,
  diff,
  savePermissions,
  loadPermissions,
  route,
  params,
  initialize,
  fetchTables,
}) {
  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (params.databaseId == null) {
      return;
    }
    fetchTables(params.databaseId);
  }, [params.databaseId, fetchTables]);

  return (
    <PermissionsPageLayout
      tab="data"
      onLoad={loadPermissions}
      onSave={savePermissions}
      diff={diff}
      isDirty={isDirty}
      route={route}
      toolbarRightContent={DATA_PERMISSIONS_TOOLBAR_CONTENT}
      helpContent={<DataPermissionsHelp />}
    >
      {children}
    </PermissionsPageLayout>
  );
}

DataPermissionsPage.propTypes = propTypes;

export default _.compose(
  Groups.loadList(),
  Databases.loadList({
    selectorName: "getListUnfiltered",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DataPermissionsPage);
