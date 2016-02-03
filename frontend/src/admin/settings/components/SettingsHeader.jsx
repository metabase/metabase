import React, { Component, PropTypes } from "react";

import SaveStatus from "metabase/components/SaveStatus.jsx";

export default class SettingsHeader extends Component {
    render() {
        return (
            <div className="MetadataEditor-header clearfix relative">
                <div className="MetadataEditor-headerSection float-left h2 text-grey-4">
                    Settings
                </div>
                <div className="MetadataEditor-headerSection absolute right float-right top bottom flex layout-centered">
                    <SaveStatus ref="status" />
                </div>
            </div>
        );
    }
}
