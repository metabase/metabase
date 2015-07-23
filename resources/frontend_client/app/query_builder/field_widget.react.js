"use strict";

import FieldSelector from "./field_selector.react";
import FieldName from "./field_name.react";
import PopoverWithTrigger from "./popover_with_trigger.react";

import Query from "./query";

export default React.createClass({
    displayName: "FieldWidget",
    propTypes: {
        // field:
        fields: React.PropTypes.array.isRequired,
        onClick: React.PropTypes.func,
        isInitiallyOpen: React.PropTypes.bool
    },

    setField:function(value) {
        this.props.setField(value);
        if (Query.isValidField(value)) {
            this.refs.popover.toggleModal();
        }
    },

    render: function() {
        var triggerElement = (
            <FieldName
                className={this.props.className}
                field={this.props.field}
                fields={this.props.fields}
            />
        );

        var tetherOptions = {
            attachment: 'top left',
            targetAttachment: 'bottom left',
            targetOffset: '10px 25px'
        };

        return (
            <PopoverWithTrigger
                ref="popover"
                className="PopoverBody PopoverBody--withArrow FieldPopover"
                tetherOptions={tetherOptions}
                triggerElement={triggerElement}
                isInitiallyOpen={this.props.isInitiallyOpen}
            >
                <FieldSelector
                    field={this.props.field}
                    fields={this.props.fields}
                    tableName={this.props.tableName}
                    setField={this.setField}
                />
            </PopoverWithTrigger>
        );
    }
});
