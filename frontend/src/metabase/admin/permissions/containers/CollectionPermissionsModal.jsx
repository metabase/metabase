import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import PermissionsGrid from "../components/PermissionsGrid";
import fitViewport from "metabase/hoc/FitViewPort";

import { CollectionsApi } from "metabase/services";
import Collections from "metabase/entities/collections";

import {
  getCollectionsPermissionsGrid,
  getIsDirty,
  getDiff,
} from "../selectors";
import { initialize, updatePermission, savePermissions } from "../permissions";

const mapStateToProps = (state, props) => {
  return {
    grid: getCollectionsPermissionsGrid(state, {
      collectionId: props.params.collectionId,
      singleCollectionMode: true,
    }),
    isDirty: getIsDirty(state, props),
    diff: getDiff(state, props),
  };
};

const mapDispatchToProps = {
  initialize,
  loadCollections: Collections.actions.fetchList,
  onUpdatePermission: updatePermission,
  onSave: savePermissions,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
@fitViewport
export default class CollectionPermissionsModal extends Component {
  componentWillMount() {
    this.props.initialize(CollectionsApi.graph, CollectionsApi.updateGraph);
    this.props.loadCollections();
  }
  render() {
    const { grid, onUpdatePermission, isDirty, onClose, onSave } = this.props;
    return (
      <ModalContent
        title={t`Permissions for this collection`}
        onClose={onClose}
        footer={[
          <Link className="link" to="/admin/permissions/collections">
            {t`See all collection permissions`}
          </Link>,
          <Button onClick={onClose}>{t`Cancel`}</Button>,
          <Button
            primary
            disabled={!isDirty}
            onClick={async () => {
              try {
                await onSave();
                onClose();
              } catch (e) {
                alert("Saving failed");
              }
            }}
          >
            {t`Save`}
          </Button>,
        ]}
      >
        <div className="relative" style={{ height: "50vh" }}>
          {grid && (
            <PermissionsGrid
              className="spread"
              grid={grid}
              onUpdatePermission={onUpdatePermission}
              cellHeight={60}
              isPivoted={true}
              showHeader={false}
            />
          )}
        </div>
      </ModalContent>
    );
  }
}
