'use strict';

import PopoverWithTrigger from '../../../query_builder/popover_with_trigger.react';
import ColumnarSelector from '../../../query_builder/columnar_selector.react';
import Icon from '../../../query_builder/icon.react';

export default React.createClass({
    displayName: "MetadataHeader",
    propTypes: {
        database: React.PropTypes.object.isRequired,
        databases: React.PropTypes.array.isRequired,
        // metabaseApi: React.PropTypes.func.isRequired,
        // isShowingSchema: React.PropTypes.bool.isRequired,
        selectDatabaseFn: React.PropTypes.func.isRequired,
        // toggleShowSchemaFn: React.PropTypes.func.isRequired,
    },

    renderDbSelector: function() {
        if (this.props.databases.length > 1) {
            var database = this.props.databases.filter((db) => db.id === this.props.database.id)[0];
            var columns = [{
                selectedItem: database,
                items: this.props.databases,
                itemTitleFn: (db) => db.name,
                itemSelectFn: (db) => {
                    this.props.selectDatabaseFn(db)
                    this.refs.databasePopover.toggleModal();
                    console.log("toggle")
                }
            }];
            var tetherOptions = {
                attachment: 'top left',
                targetAttachment: 'bottom left',
                targetOffset: '15px 0'
            };
            var triggerElement = (
                <span className="text-bold cursor-pointer text-default">
                    {this.props.database.name}
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
                <div className="MetadataEditor-header-section h2">
                    Edit Metadata for {this.renderDbSelector()}
                </div>
                <div className="MetadataEditor-header-section flex-align-right">
                    Show original schema {this.props.isShowingSchema}
                </div>
            </div>
        );
    }
});
