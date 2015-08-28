'use strict';

import Icon from "metabase/components/Icon.react";
import inflection from 'inflection';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'DataReferenceMain',
    propTypes: {
        Metabase: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            databases: {},
            tables: {}
        };
    },

    render: function() {
        var databases;
        if (this.props.databases) {
            databases = this.props.databases.map((database) => {
                var dbTables = this.state.databases[database.id];
                if (dbTables === undefined) {
                    this.state.databases[database.id] = null; // null indicates loading
                    this.props.Metabase.db_tables({
                        'dbId': database.id
                    }).$promise.then((db) => {
                        this.state.databases[database.id] = db;
                        this.setState({ databases: this.state.databases });
                    });
                }
                var tables;
                var tableCount;
                if (dbTables && dbTables.length > 0) {
                    tableCount = dbTables.length + " " + inflection.inflect("table", dbTables.length);
                    tables = dbTables.map((table, index) => {
                        var classes = cx({
                            'p1' : true,
                            'border-bottom': index !== dbTables.length - 1
                        })
                        return (
                            <li key={table.id} className={classes}>
                                <a className="text-brand text-brand-darken-hover no-decoration" href="#" onClick={this.props.showTable.bind(null, table)}>{table.display_name}</a>
                            </li>
                        );
                    });
                    return (
                        <li key={database.id}>
                            <div className="my2">
                                <h2 className="inline-block">{database.name}</h2>
                                <span className="ml1">{tableCount}</span>
                            </div>
                            <ul>{tables}</ul>
                        </li>
                    );
                }
            });
        }

        return (
            <div>
                <h1>Data Reference</h1>
                <p>Learn more about your data structure to  ask more useful questions.</p>
                <ul>
                    {databases}
                </ul>
            </div>
        );
    },
})
