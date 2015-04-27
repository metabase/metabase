'use strict';
/*global SelectionModule, DatabaseSelector*/

var NativeQueryEditor = React.createClass({
    displayName: 'NativeQueryEditor',
    propTypes: {
        databases: React.PropTypes.array.isRequired,
        defaultQuery: React.PropTypes.object.isRequired,
        query: React.PropTypes.object.isRequired,
        runFn: React.PropTypes.func.isRequired,
        notifyQueryModifiedFn: React.PropTypes.func.isRequired,
        isRunning: React.PropTypes.bool.isRequired
    },
    setDatabase: function(databaseId) {
        // check if this is the same db or not
        if (databaseId !== this.props.query.database) {
            // reset to a brand new query
            var query = this.props.defaultQuery;

            // set our new database on the query
            query.database = databaseId;

            // notify parent that we've started over
            this.props.notifyQueryModifiedFn(query);
        }
    },
    canRunQuery: function() {
        return (this.props.query.database !== undefined && this.props.query.native.query !== "");
    },
    runQuery: function() {
        this.props.runFn(this.props.query);
    },
    onChange: function(event) {
        var query = this.props.query;
        query.native.query = event.target.value;
        this.props.notifyQueryModifiedFn(query);
    },
    render: function () {
        //console.log(this.props.query);
        // we only render a db selector if there are actually multiple to choose from
        var dbSelector;
        if(this.props.databases && this.props.databases.length > 1) {
            dbSelector = (
                <DatabaseSelector
                    databases={this.props.databases}
                    setDatabase={this.setDatabase}
                    currentDatabaseId={this.props.query.database}
                />
            );
        }

        return (
            <div>
                <textarea ref="sql" defaultValue={this.props.query.native.query} onChange={this.onChange}></textarea>
                <div>
                    {dbSelector}
                    <RunButton
                        canRun={this.canRunQuery()}
                        isRunning={this.props.isRunning}
                        runFn={this.runQuery}
                    />
                </div>
            </div>
        );
    }
});
