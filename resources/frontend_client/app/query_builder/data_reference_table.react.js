'use strict';

import Icon from './icon.react';
import inflection from 'inflection';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'DataReferenceTable',

    getInitialState: function() {
        return {
            table: undefined,
            pane: "fields"
        };
    },

    showPane: function(name) {
        this.setState({ pane: name });
    },

    render: function(page) {
        var table = this.state.table;
        if (table === undefined) {
            this.state.table = null; // null indicates loading
            this.props.Metabase.table_query_metadata({
                'tableId': this.props.table.id
            }).$promise.then((table) => {
                this.setState({ table: table });
            });
        }
        if (table) {
            var name = inflection.humanize(table.name);
            var rowStats;
            if (table.rows != null) {
                var words = inflection.humanize(table.name, true).split(" ");
                words.push(inflection.inflect(words.pop(), table.rows)); // inflect the last word
                rowStats = <p>There {table.rows === 1 ? "is" : "are"} {table.rows} {words.join(" ")}</p>
            }
            var fieldCount = table.fields.length + " " + inflection.inflect("field", table.fields.length);
            var panes = {
                "fields": fieldCount,
                "metrics": "0 Metrics",
                "connections": "O Connections"
            };
            var tabs = Object.keys(panes).map((name) => {
                var classes = cx({
                    'Button': true,
                    'Button--small': true,
                    'Button--active': name === this.state.pane
                });
                return <a key={name} className={classes} href="#" onClick={this.showPane.bind(null, name)}>{panes[name]}</a>
            });

            var pane;
            if (this.state.pane === "fields") {
                var fields = table.fields.map((field, index) => {
                    var classes = cx({ 'p1' : true, 'border-bottom': index !== table.fields.length - 1 })
                    var name =  inflection.humanize(field.name);
                    return (
                        <li key={field.id} className={classes}>
                            <a className="text-brand no-decoration" href="#" onClick={this.props.showField.bind(null, field)}>{name}</a>
                        </li>
                    );
                });
                pane = <ul>{fields}</ul>;
            }

            return (
                <div>
                    <h1>{name}</h1>
                    <p>{table.description}</p>
                    {rowStats}
                    <div className="Button-group Button-group--brand text-uppercase">
                        {tabs}
                    </div>
                    {pane}
                </div>
            );
        } else {
            return null;
        }
    }
})
