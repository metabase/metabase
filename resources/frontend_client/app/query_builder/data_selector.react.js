"use strict";

import Icon from './icon.react';
import PopoverWithTrigger from './popover_with_trigger.react';
import ColumnarSelector from './columnar_selector.react';

export default React.createClass({
    displayName: "DataSelector",
    propTypes: {
        query: React.PropTypes.object.isRequired,
        databases: React.PropTypes.array.isRequired,
        tables: React.PropTypes.array,
        setDatabaseFn: React.PropTypes.func.isRequired,
        setSourceTableFn: React.PropTypes.func,
        isInitiallyOpen: React.PropTypes.bool,
        name: React.PropTypes.string
    },

    getDefaultProps: function() {
        return {
            name: "Data",
            isInitiallyOpen: false
        };
    },

    toggleModal: function() {
        this.refs.popover.toggleModal();
    },

    render: function() {
        var database = this.props.databases && this.props.databases.filter((t) => t.id === this.props.query.database)[0]
        var table = this.props.tables && this.props.tables.filter((t) => t.id === this.props.query.query.source_table)[0]

        var content;
        if (this.props.tables) {
            if (table) {
                content = <span className="text-grey no-decoration">{table.display_name}</span>;
            } else {
                content = <span className="text-grey-4 no-decoration">Select a table</span>;
            }
        } else {
            if (database) {
                content = <span className="text-grey no-decoration">{database.name}</span>;
            } else {
                content = <span className="text-grey-4 no-decoration">Select a database</span>;
            }
        }

        var triggerElement = (
            <span className="px2 py2 text-bold cursor-pointer text-default">
                {content}
                <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
            </span>
        )

        var columns = [
            {
                title: "Databases",
                selectedItem: database,
                items: this.props.databases,
                itemTitleFn: (db) => db.name,
                itemSelectFn: (db) => this.props.setDatabaseFn(db.id)
            }
        ];

        if (database && this.props.tables) {
            columns.push({
                title: database.name + " Tables",
                selectedItem: table,
                items: this.props.tables,
                itemTitleFn: (table) => table.display_name,
                itemSelectFn: (table) => { this.props.setSourceTableFn(table.id); this.toggleModal() }
            })
        }

        var tetherOptions = {
            attachment: 'top left',
            targetAttachment: 'bottom left',
            targetOffset: '5px 15px'
        };

        var name = this.props.name;
        var classes = "GuiBuilder-section GuiBuilder-data flex align-center " + (this.props.className || "");
        return (
            <div className={classes}>
                <span className="GuiBuilder-section-label Query-label">{name}</span>
                <PopoverWithTrigger ref="popover"
                                    className="PopoverBody PopoverBody--withArrow"
                                    isInitiallyOpen={this.props.isInitiallyOpen}
                                    tetherOptions={tetherOptions}
                                    triggerElement={triggerElement}
                                    triggerClasses="flex align-center">
                    <ColumnarSelector columns={columns}/>
                </PopoverWithTrigger>
            </div>
        );
    },
})
