import React, { Component, PropTypes } from "react";

import ColumnarSelector from "metabase/components/ColumnarSelector.jsx";
import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

export default class Select extends Component {
    static propTypes = {
        value: PropTypes.any,
        options: PropTypes.array.isRequired,
        placeholder: PropTypes.string,
        onChange: PropTypes.func,
        optionNameFn: PropTypes.func,
        optionValueFn: PropTypes.func
    };

    static defaultProps = {
        isInitiallyOpen: false,
        placeholder: "",
        optionNameFn: (option) => option.name,
        optionValueFn: (option) => option
    };

    toggle() {
        this.refs.popover.toggle();
    }

    render() {
        var selectedName = this.props.value ? this.props.optionNameFn(this.props.value) : this.props.placeholder;

        var triggerElement = (
            <div className={"flex align-center " + (!this.props.value ? " text-grey-3" : "")}>
                <span className="mr1">{selectedName}</span>
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
                    this.toggle();
                }
            }
        ];

        return (
            <PopoverWithTrigger ref="popover"
                                className={this.props.className}
                                triggerElement={triggerElement}
                                triggerClasses={"AdminSelect " + (this.props.className || "")}>
                <ColumnarSelector
                    columns={columns}
                />
            </PopoverWithTrigger>
        );
    }
}
