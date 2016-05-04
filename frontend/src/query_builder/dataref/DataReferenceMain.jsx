import React, { Component, PropTypes } from "react";

import { isQueryable } from "metabase/lib/table";

import inflection from 'inflection';
import cx from "classnames";


export default class DataReferenceMain extends Component {

    static propTypes = {
        Metabase: PropTypes.func.isRequired,
        closeFn: PropTypes.func.isRequired
    };

    render() {
        let databases;
        if (this.props.databases) {
            databases = this.props.databases.map((database) => {
                if (database.tables && database.tables.length > 0) {
                    const tableCount = database.tables.length + " " + inflection.inflect("table", database.tables.length);
                    const tables = database.tables.filter(isQueryable).map((table, index) => {
                        let classes = cx({
                            'p1' : true,
                            'border-bottom': index !== database.tables.length - 1
                        })
                        return (
                            <li key={table.id} className={classes}>
                                <a className="text-brand text-brand-darken-hover no-decoration" onClick={this.props.showTable.bind(null, table)}>{table.display_name}</a>
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
                <p>Learn more about your data structure to
 ask more useful questions.</p>
                <ul>
                    {databases}
                </ul>
            </div>
        );
    }
}
