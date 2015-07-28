'use strict';

import MetadataHeader from './MetadataHeader.react';
import MetadataTableList from './MetadataTableList.react';
import MetadataTableEditor from './MetadataTableEditor.react';

export default React.createClass({
    displayName: "MetadataEditor",
    propTypes: {
        databases: React.PropTypes.array.isRequired,
        metabaseApi: React.PropTypes.func.isRequired,
        selectDatabaseFn: React.PropTypes.func.isRequired,
    },

    render: function() {
        console.log("render")
        return (
            <div className="MetadataEditor p3">
                <MetadataHeader
                    database={this.props.database}
                    databases={this.props.databases}
                    selectDatabaseFn={this.props.selectDatabaseFn}
                />
                <div className="MetadataEditor-main flex">
                    <MetadataTableList />
                    <MetadataTableEditor />
                </div>
            </div>
        );
    }
});
