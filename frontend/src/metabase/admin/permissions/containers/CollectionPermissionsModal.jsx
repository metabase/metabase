import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import PermissionsGrid from "../components/PermissionsGrid";

import { CollectionsApi } from "metabase/services";
import Collections from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";

import {
  getCollectionsPermissionsGrid,
  getIsDirty,
  getDiff,
} from "../selectors";
import { initialize, updatePermission, savePermissions } from "../permissions";

const getCollectionEntity = props =>
  props.namespace === "snippets" ? SnippetCollections : Collections;

const mapStateToProps = (state, props) => {
  const { collectionId } = props.params;
  return {
    grid: getCollectionsPermissionsGrid(state, {
      collectionId,
      singleCollectionMode: true,
      namespace: props.namespace,
    }),
    isDirty: getIsDirty(state, props),
    diff: getDiff(state, props),
    collection: getCollectionEntity(props).selectors.getObject(state, {
      entityId: collectionId,
    }),
  };
};

const mapDispatchToProps = (dispatch, props) =>
  _.mapObject(
    {
      initialize,
      loadCollections: getCollectionEntity(props).actions.fetchList,
      onUpdatePermission: updatePermission,
      onSave: savePermissions,
    },
    f => (...args) => dispatch(f(...args)),
  );

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class CollectionPermissionsModal extends Component {
  componentWillMount() {
    const { namespace, loadCollections, initialize } = this.props;
    initialize(
      () => CollectionsApi.graph({ namespace }),
      graph => CollectionsApi.updateGraph({ ...graph, namespace }),
    );
    loadCollections();
  }
  render() {
    const {
      grid,
      onUpdatePermission,
      isDirty,
      onClose,
      onSave,
      namespace,
      collection,
    } = this.props;
    return (
      <ModalContent
        title={
          collection && collection.name
            ? t`Permissions for ${collection.name}`
            : namespace === "snippets"
            ? t`Permissions for this folder`
            : t`Permissions for this collection`
        }
        onClose={onClose}
        footer={[
          ...(namespace === "snippets"
            ? []
            : [
                <Link className="link" to="/admin/permissions/collections">
                  {t`See all collection permissions`}
                </Link>,
              ]),
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
