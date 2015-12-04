import React, { Component, PropTypes } from "react";

import SaveStatus from "metabase/components/SaveStatus.jsx";
import Toggle from "metabase/components/Toggle.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import ColumnarSelector from "metabase/components/ColumnarSelector.jsx";
import Icon from "metabase/components/Icon.jsx";

export default class MetadataHeader extends Component {
    static propTypes = {
        databaseId: PropTypes.number,
        databases: PropTypes.array.isRequired,
        selectDatabase: PropTypes.func.isRequired,
        isShowingSchema: PropTypes.bool.isRequired,
        toggleShowSchema: PropTypes.func.isRequired,
    };

    setSaving() {
        this.refs.status.setSaving.apply(this, arguments);
    }

    setSaved() {
        this.refs.status.setSaved.apply(this, arguments);
    }

    setSaveError() {
        this.refs.status.setSaveError.apply(this, arguments);
    }

    renderDbSelector() {
        var database = this.props.databases.filter((db) => db.id === this.props.databaseId)[0];
        if (database) {
            var columns = [{
                selectedItem: database,
                items: this.props.databases,
                itemTitleFn: (db) => db.name,
                itemSelectFn: (db) => {
                    this.props.selectDatabase(db)
                    this.refs.databasePopover.toggle();
                }
            }];
            var triggerElement = (
                <span className="text-bold cursor-pointer text-default">
                    {database.name}
                    <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
                </span>
            );
            return (
                <PopoverWithTrigger
                    ref="databasePopover"
                    triggerElement={triggerElement}
                >
                    <ColumnarSelector columns={columns}/>
                </PopoverWithTrigger>
            );
        }
    }

    render() {
        return (
            <div className="MetadataEditor-header flex align-center">
                <div className="MetadataEditor-headerSection h2 mb2">
                    <span className="text-grey-4">Current database:</span> {this.renderDbSelector()}
                </div>
                <div className="MetadataEditor-headerSection flex-align-right flex align-center">
                    <SaveStatus ref="status" />
                    <span className="mr1">Show original schema</span>
                    <Toggle value={this.props.isShowingSchema} onChange={this.props.toggleShowSchema} />
                </div>
            </div>
        );
    }
}
