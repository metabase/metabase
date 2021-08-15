import React, { useEffect } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { connect } from "react-redux";

import Databases from "metabase/entities/databases";
import Groups from "metabase/entities/groups";

import { getIsDirty, getDiff } from "../../selectors/data-permissions";
import {
  saveDataPermissions,
  loadDataPermissions,
  initializeDataPermissions,
} from "../../permissions";
import PermissionsPageLayout from "../../components/PermissionsPageLayout/PermissionsPageLayout";

const propTypes = {
  children: PropTypes.node.isRequired,
  isDirty: PropTypes.bool,
  diff: PropTypes.object,
  savePermissions: PropTypes.func.isRequired,
  loadPermissions: PropTypes.func.isRequired,
  initialize: PropTypes.func.isRequired,
  route: PropTypes.object,
};

function DataPermissionsPage({
  children,
  isDirty,
  diff,
  savePermissions,
  loadPermissions,
  route,
  initialize,
}) {
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <PermissionsPageLayout
      tab="data"
      onLoad={loadPermissions}
      onSave={savePermissions}
      diff={diff}
      isDirty={isDirty}
      route={route}
    >
      {children}
    </PermissionsPageLayout>
  );
}

DataPermissionsPage.propTypes = propTypes;

const mapDispatchToProps = {
  loadPermissions: loadDataPermissions,
  savePermissions: saveDataPermissions,
  initialize: initializeDataPermissions,
};

const mapStateToProps = (state, props) => ({
  isDirty: getIsDirty(state, props),
  diff: getDiff(state, props),
});

export default _.compose(
  Databases.loadList({ entityQuery: { include: "tables" } }),
  Groups.loadList(),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(DataPermissionsPage);
