'use strict';

import PopoverWithTrigger from '../../../query_builder/popover_with_trigger.react';
import ColumnarSelector from '../../../query_builder/columnar_selector.react';
import Icon from '../../../query_builder/icon.react';

export default React.createClass({
    displayName: "MetadataHeader",
    propTypes: {
        databaseId: React.PropTypes.number,
        databases: React.PropTypes.array.isRequired,
        selectDatabase: React.PropTypes.func.isRequired,
        isShowingSchema: React.PropTypes.bool.isRequired,
        toggleShowSchema: React.PropTypes.func.isRequired,
    },

    getInitialState: function() {
        return {
            saving: false,
            recentlySavedTimeout: null,
            error: null
        }
    },

    setSaving: function() {
        clearTimeout(this.state.recentlySavedTimeout);
        this.setState({ saving: true, recentlySavedTimeout: null, error: null });
    },

    setSaved: function() {
        clearTimeout(this.state.recentlySavedTimeout);
        var recentlySavedTimeout = setTimeout(() => this.setState({ recentlySavedTimeout: null }), 5000);
        this.setState({ saving: false, recentlySavedTimeout: recentlySavedTimeout, error: null });
    },

    setSaveError: function(error) {
        this.setState({ saving: false, recentlySavedTimeout: null, error: error });
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

    renderSaveWidget: function() {
        if (this.state.saving) {
            return (<div className="mx2 px2 border-right"><div className="Spinner"></div></div>);
        } else if (this.state.error) {
            return (<div className="mx2 px2 border-right text-error">Error: {this.state.error}</div>)
        } else if (this.state.recentlySavedTimeout != null) {
            return (<div className="mx2 px2 border-right"><Icon name="check" width="12" height="12" /> Saved</div>)
        }
    },

    render: function() {
        return (
            <div className="MetadataEditor-header flex align-center">
                <div className="MetadataEditor-header-section h2">
                    <span className="text-grey-4">Edit Metadata for</span> {this.renderDbSelector()}
                </div>
                <div className="MetadataEditor-header-section flex-align-right flex align-center">
                    {this.renderSaveWidget()}
                    <span>Show original schema</span>
                    <span className={"Toggle " + (this.props.isShowingSchema ? "selected" : "")} onClick={this.props.toggleShowSchema}></span>
                </div>
            </div>
        );
    }
});
