/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import { Box } from "grid-styled";

import * as Urls from "metabase/lib/urls";
import { CollectionsApi } from "metabase/services";

import Collections from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";

import { isPersonalCollectionChild } from "metabase/collections/utils";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

import PermissionsGrid from "../components/PermissionsGrid";
import EmptyState from "metabase/components/EmptyState";
import { PermissionsTable } from "../components/permissions-table";

import {
  getCollectionsPermissionsGrid,
  getIsDirty,
  getDiff,
} from "../selectors";
import { initialize, updatePermission, savePermissions } from "../permissions";

const getCollectionEntity = props =>
  props.namespace === "snippets" ? SnippetCollections : Collections;

const mapStateToProps = (state, props) => {
  const collectionId = Urls.extractCollectionId(props.params.slug);
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
    collectionsList: getCollectionEntity(props).selectors.getList(state, props),
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
  UNSAFE_componentWillMount() {
    const { namespace, loadCollections, initialize } = this.props;
    initialize(
      () => CollectionsApi.graph({ namespace }),
      graph => CollectionsApi.updateGraph({ ...graph, namespace }),
    );
    loadCollections();
  }

  componentDidUpdate() {
    const { collection, collectionsList, onClose } = this.props;

    const loadedPersonalCollection =
      collection &&
      Array.isArray(collectionsList) &&
      (collection.personal_owner_id ||
        isPersonalCollectionChild(collection, collectionsList));

    if (loadedPersonalCollection) {
      onClose();
    }
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

    console.log(">>>grid", grid);

    // const entities = grid.groups.map(group => {
    //   return {
    //     ...group,
    //   };
    // });

    // const permissions = [
    //   {
    //     displayName: "Collection access",
    //     name: "collection_access",
    //     options: [
    //       {
    //         label: "Database",
    //         value: "yo1",
    //         icon: "arrow_left",
    //         iconColor: "red",
    //       },
    //       {
    //         label: "Database2",
    //         value: "yo2",
    //         icon: "arrow_left",
    //         iconColor: "green",
    //       },
    //       {
    //         label: "Database3",
    //         value: "yo3",
    //         icon: "arrow_left",
    //         iconColor: "red",
    //       },
    //     ],
    //   },
    // ];

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
                <Link
                  key="all-permissions"
                  className="link"
                  to="/admin/permissions/collections"
                >
                  {t`See all collection permissions`}
                </Link>,
              ]),
          <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
          <Button
            key="save"
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

          {/* {grid && (
            <PermissionsTable
              entityName={t`Group name`}
              entities={grid.groups}
              permissions={permissions}
              emptyState={
                <Box mt="120px">
                  <EmptyState message={t`Nothing here`} icon="all" />
                </Box>
              }
            />
          )} */}
        </div>
      </ModalContent>
    );
  }
}
