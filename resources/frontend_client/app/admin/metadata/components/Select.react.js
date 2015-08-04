"use strict";

import ColumnarSelector from '../../../query_builder/columnar_selector.react';
import Icon from '../../../query_builder/icon.react';
import PopoverWithTrigger from '../../../query_builder/popover_with_trigger.react';

export default React.createClass({
    displayName: "Select",
    propTypes: {
        value: React.PropTypes.object,
        options: React.PropTypes.array.isRequired,
        onChange: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            isInitiallyOpen: false,
            placeholder: ""
        };
    },

    toggleModal: function() {
        this.refs.popover.toggleModal();
    },

    render: function() {
        var selectedName = this.props.value ? this.props.value.name : this.props.placeholder;

        var triggerElement = (
            <div className="flex flex-full align-center">
                <span>{selectedName}</span>
                <Icon className="flex-align-right" name="chevrondown"  width="10" height="10"/>
            </div>
        );

        var columns = [
            {
                selectedItem: this.props.value,
                items: this.props.options,
                itemTitleFn: (item) => item.name,
                itemDescriptionFn: (item) => item.description,
                itemSelectFn: (item) => {
                    this.props.onChange(item)
                    this.toggleModal();
                }
            }
        ];

        var tetherOptions = {
            attachment: 'top center',
            targetAttachment: 'bottom center',
            targetOffset: '10px 0'
        };

        return (
            <div className="AdminSelect flex align-center">
                <PopoverWithTrigger ref="popover"
                                    className={"PopoverBody PopoverBody--withArrow " + (this.props.className || "")}
                                    tetherOptions={tetherOptions}
                                    triggerElement={triggerElement}
                                    triggerClasses={this.props.className + " flex flex-full align-center" }>
                    <ColumnarSelector columns={columns}/>
                </PopoverWithTrigger>
            </div>
        );
    }

});
