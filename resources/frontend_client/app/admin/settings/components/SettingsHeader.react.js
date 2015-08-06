"use strict";

import SaveStatus from "../../metadata/components/SaveStatus.react";

export default React.createClass({
    displayName: "SettingsHeader",

    render: function() {
        return (
            <div className="MetadataEditor-header flex align-center">
                <div className="MetadataEditor-header-section h2">
                    <span className="text-grey-4">Settings</span>
                </div>
                <div className="MetadataEditor-header-section flex-align-right flex align-center">
                    <SaveStatus ref="status" />
                </div>
            </div>
        );
    },
})
