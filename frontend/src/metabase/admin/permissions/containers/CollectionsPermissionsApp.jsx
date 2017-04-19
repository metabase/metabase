import React, { Component } from "react";
import { connect } from "react-redux";

import PermissionsEditor from "../components/PermissionsEditor.jsx";
import PermissionsApp from "./PermissionsApp.jsx";

import { CollectionsApi } from "metabase/services";

import { getCollectionsPermissionsGrid, getIsDirty, getSaveError, getDiff } from "../selectors";
import { updatePermission, savePermissions, loadCollections } from "../permissions";
import { goBack, push } from "react-router-redux";

const mapStateToProps = (state, props) => {
    return {
        grid: getCollectionsPermissionsGrid(state, props),
        isDirty: getIsDirty(state, props),
        saveError: getSaveError(state, props),
        diff: getDiff(state, props)
    }
}

const mapDispatchToProps = {
    onUpdatePermission: updatePermission,
    onSave: savePermissions,
    onCancel: () => window.history.length > 1 ? goBack() : push("/questions")
};

const Editor = connect(mapStateToProps, mapDispatchToProps)(PermissionsEditor);

@connect(null, { loadCollections })
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
            >
                <Editor {...this.props} modal confirmCancel={false} />
            </PermissionsApp>
        )
    }
}
