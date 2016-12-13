import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PermissionsEditor from "../components/PermissionsEditor.jsx";

// import { getDatabasesPermissionsGrid, getIsDirty, getSaveError, getDiff } from "../selectors";
// import { updatePermission, savePermissions, loadPermissions } from "../permissions"

import { assocIn, getIn } from "icepick";

import { createSelector } from "reselect";

const getCollections = () => [
    { id: 1, name: "foo" },
    { id: 2, name: "bar" },
    { id: 3, name: "baz" },
]

const getGroups = () => [
    { id: 1, name: "admin" },
    { id: 2, name: "marketing" },
    { id: 3, name: "engineering" },
]

const getPermissions = () => {
    return {
        "1": {
          "1": "none",
          "3": "none",
          "2": "none"
        },
        "3": {
          "1": "none",
          "3": "none",
          "2": "none"
        },
        "2": {
          "1": "write",
          "3": "write",
          "2": "write"
        }
      }
}

export const getCollectionsPermissionsGrid = createSelector(
    getCollections, getGroups, getPermissions,
    (collections, groups: Array<Group>, permissions: GroupsPermissions) => {
        if (!groups || !permissions || !collections) {
            return null;
        }

        return {
            type: "collection",
            groups,
            permissions: {
                "access": {
                    options(groupId, entityId) {
                        return ["write", "read", "none"];
                    },
                    getter(groupId, { collectionId }) {
                        return getIn(permissions, [groupId, collectionId]);
                    },
                    updater(groupId, { collectionId }, value) {
                        return assocIn(permissions, [groupId, collectionId], value);
                    },
                    confirm(groupId, entityId, value) {
                        return [];
                    },
                    warning(groupId, entityId) {
                    }
                },
            },
            entities: collections.map(collection => {
                return {
                    id: {
                        collectionId: collection.id
                    },
                    name: collection.name
                }
            })
        }
    }
);

const mapStateToProps = (state, props) => {
    return {
        grid: getCollectionsPermissionsGrid(state, props),
        isDirty: false,//getIsDirty(state, props),
        saveError: null,//getSaveError(state, props),
        diff: null,//getDiff(state, props)
    }
}

const mapDispatchToProps = {
    onUpdatePermission: null,//updatePermission,
    onSave: null,//savePermissions,
    onCancel: null//loadPermissions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class CollectionPermissionsApp extends Component {
    render() {
        return <PermissionsEditor {...this.props} />
    }
}
