"use strict";

import ColumnarSelector from '../../../query_builder/columnar_selector.react';
import Icon from '../../../query_builder/icon.react';
import PopoverWithTrigger from '../../../query_builder/popover_with_trigger.react';

export default React.createClass({
    displayName: "Select",
    propTypes: {
        value: React.PropTypes.any,
        options: React.PropTypes.array.isRequired,
        placeholder: React.PropTypes.string,
        onChange: React.PropTypes.func,
        optionNameFn: React.PropTypes.func,
        optionValueFn: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            isInitiallyOpen: false,
            placeholder: "",
            optionNameFn: (option) => option.name,
            optionValueFn: (option) => option
        };
    },

    toggleModal: function() {
        this.refs.popover.toggleModal();
    },

    render: function() {
        var selectedName = this.props.value ? this.props.optionNameFn(this.props.value) : this.props.placeholder;

        var triggerElement = (
            <div className={"flex flex-full align-center" + (!this.props.value ? " text-grey-3" : "")}>
                <span>{selectedName}</span>
                <Icon className="flex-align-right" name="chevrondown"  width="10" height="10"/>
            </div>
        );

        var sections = {};
        this.props.options.forEach(function (option) {
            var sectionName = option.section || "";
            sections[sectionName] = sections[sectionName] || { title: sectionName || undefined, items: [] };
            sections[sectionName].items.push(option);
        });
        sections = Object.keys(sections).map((sectionName) => sections[sectionName]);

        var columns = [
            {
                selectedItem: this.props.value,
                sections: sections,
                itemTitleFn: this.props.optionNameFn,
                itemDescriptionFn: (item) => item.description,
                itemSelectFn: (item) => {
                    this.props.onChange(this.props.optionValueFn(item))
                    this.toggleModal();
                }
            }
        ];

        var tetherOptions = {
            attachment: 'top center',
            targetAttachment: 'bottom center',
            targetOffset: '5px 0'
        };

        return (
            <PopoverWithTrigger ref="popover"
                                className={"PopoverBody PopoverBody--withArrow " + (this.props.className || "")}
                                tetherOptions={tetherOptions}
                                triggerElement={triggerElement}
                                triggerClasses={this.props.className + " AdminSelect flex align-center" }>
                <ColumnarSelector columns={columns}/>
            </PopoverWithTrigger>
        );
    }

});
