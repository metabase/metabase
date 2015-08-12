'use strict';

import SaveStatus from "metabase/components/SaveStatus.react";
import Toggle from "metabase/components/Toggle.react";

import PopoverWithTrigger from '../../../query_builder/popover_with_trigger.react';
import ColumnarSelector from '../../../query_builder/columnar_selector.react';
import Icon from "metabase/components/Icon.react";

export default React.createClass({
    displayName: "MetadataHeader",
    propTypes: {
        databaseId: React.PropTypes.number,
        databases: React.PropTypes.array.isRequired,
        selectDatabase: React.PropTypes.func.isRequired,
        isShowingSchema: React.PropTypes.bool.isRequired,
        toggleShowSchema: React.PropTypes.func.isRequired,
    },

    setSaving: function() {
        this.refs.status.setSaving.apply(this, arguments);
    },

    setSaved: function() {
        this.refs.status.setSaved.apply(this, arguments);
    },

    setSaveError: function() {
        this.refs.status.setSaveError.apply(this, arguments);
    },

    renderDbSelector: function() {
        var database = this.props.databases.filter((db) => db.id === this.props.databaseId)[0];
        if (database) {
            var columns = [{
                selectedItem: database,
                items: this.props.databases,
                itemTitleFn: (db) => db.name,
                itemSelectFn: (db) => {
                    this.props.selectDatabase(db)
                    this.refs.databasePopover.toggleModal();
                }
            }];
            var tetherOptions = {
                attachment: 'top center',
                targetAttachment: 'bottom center',
                targetOffset: '10px 0'
            };
            var triggerElement = (
                <span className="text-bold cursor-pointer text-default">
                    {database.name}
                    <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
                </span>
            );
            return (
                <PopoverWithTrigger
                    ref="databasePopover"
                    className="PopoverBody PopoverBody--withArrow"
                    tetherOptions={tetherOptions}
                    triggerElement={triggerElement}
                >
                    <ColumnarSelector columns={columns}/>
                </PopoverWithTrigger>
            );
        }
    },

    render: function() {
        return (
            <div className="MetadataEditor-header flex align-center">
                <div className="MetadataEditor-headerSection h2">
                    <span className="text-grey-4">Edit Metadata for</span> {this.renderDbSelector()}
                </div>
                <div className="MetadataEditor-headerSection flex-align-right flex align-center">
                    <SaveStatus ref="status" />
                    <span className="mr1">Show original schema</span>
                    <Toggle value={this.props.isShowingSchema} onChange={this.props.toggleShowSchema} />
                </div>
            </div>
        );
    }
});
