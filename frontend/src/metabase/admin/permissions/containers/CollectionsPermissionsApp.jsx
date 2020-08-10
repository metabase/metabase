import React, { Component } from "react";
import { connect } from "react-redux";

import PermissionsEditor from "../components/PermissionsEditor";
import PermissionsApp from "./PermissionsApp";
import fitViewport from "metabase/hoc/FitViewPort";

import { CollectionsApi } from "metabase/services";
import Collections from "metabase/entities/collections";

import {
  getCollectionsPermissionsGrid,
  getIsDirty,
  getDiff,
} from "../selectors";
import {
  updatePermission,
  savePermissions,
  loadPermissions,
} from "../permissions";
import { push } from "react-router-redux";

const mapStateToProps = (state, props) => {
  return {
    grid: getCollectionsPermissionsGrid(state, props),
    isDirty: getIsDirty(state, props),
    diff: getDiff(state, props),
    tab: "collections",
  };
};

const mapDispatchToProps = {
  onUpdatePermission: updatePermission,
  onSave: savePermissions,
  onCancel: loadPermissions,
  onChangeTab: tab => push(`/admin/permissions/${tab}`),
};

const Editor = connect(
  mapStateToProps,
  mapDispatchToProps,
)(PermissionsEditor);

@connect(
  null,
  {
    loadCollections: Collections.actions.fetchList,
    push,
  },
)
@fitViewport
export default class CollectionsPermissionsApp extends Component {
  componentWillMount() {
    this.props.loadCollections();
  }
  render() {
    return (
      <PermissionsApp
        {...this.props}
        load={CollectionsApi.graph}
        save={CollectionsApi.updateGraph}
        fitClassNames={this.props.fitClassNames + " flex-column"}
      >
        <Editor
          {...this.props}
          collectionId={this.props.params.collectionId}
          confirmCancel={false}
        />
      </PermissionsApp>
    );
  }
}
