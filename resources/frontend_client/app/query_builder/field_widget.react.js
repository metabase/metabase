"use strict";

import FieldSelector from "./field_selector.react";
import FieldName from "./field_name.react";
import Icon from "metabase/components/Icon.react";
import Popover from "metabase/components/Popover.react";

import Query from "metabase/lib/query";

export default React.createClass({
    displayName: "FieldWidget",
    propTypes: {
        field: React.PropTypes.oneOfType([React.PropTypes.number, React.PropTypes.array]),
        fieldOptions: React.PropTypes.object.isRequired,
        setField: React.PropTypes.func.isRequired,
        removeField: React.PropTypes.func,
        isInitiallyOpen: React.PropTypes.bool
    },

    getInitialState: function() {
        return {
            isOpen: this.props.isInitiallyOpen || false
        };
    },

    setField:function(value) {
        this.props.setField(value);
        if (Query.isValidField(value)) {
            this.toggle();
        }
    },

    toggle: function() {
        this.setState({ isOpen: !this.state.isOpen });
    },

    renderPopover: function() {
        if (this.state.isOpen) {
            var tetherOptions = {
                attachment: 'top center',
                targetAttachment: 'bottom center',
                targetOffset: '15px 25px'
            };
            return (
                <Popover
                    ref="popover"
                    className="PopoverBody PopoverBody--withArrow FieldPopover"
                    tetherOptions={tetherOptions}
                    onClose={this.toggle}
                >
                    <FieldSelector
                        tableName={this.props.tableName}
                        field={this.props.field}
                        fieldOptions={this.props.fieldOptions}
                        setField={this.setField}
                    />
                </Popover>
            );
        }
    },

    render: function() {
        return (
            <div className="flex align-center">
                <FieldName
                    className={this.props.className}
                    field={this.props.field}
                    fieldOptions={this.props.fieldOptions}
                    removeField={this.props.removeField}
                    onClick={this.toggle}
                />
                {this.renderPopover()}
            </div>
        );
    }
});
