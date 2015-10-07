import SaveStatus from "metabase/components/SaveStatus.react";

export default React.createClass({
    displayName: "SettingsHeader",

    render: function() {
        return (
            <div className="MetadataEditor-header flex align-center relative">
                <div className="MetadataEditor-headerSection h2 text-grey-4">
                    Settings
                </div>
                <div className="MetadataEditor-headerSection absolute right top bottom flex layout-centered">
                    <SaveStatus ref="status" />
                </div>
            </div>
        );
    },
});
