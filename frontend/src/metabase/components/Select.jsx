import React, { Component, PropTypes } from "react";

import ColumnarSelector from "metabase/components/ColumnarSelector.jsx";
import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

export default class Select extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            value: null
        };
    }

    static propTypes = {
        value: PropTypes.any,
        updateImmediately: PropTypes.bool,
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
        const value = this.props.updateImmediately ?
            this.state.value || this.props.value :
            this.props.value;

        var selectedName = value ? this.props.optionNameFn(value) : this.props.placeholder;

        var triggerElement = (
            <div className={"flex align-center " + (!value ? " text-grey-3" : "")}>
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
                selectedItem: this.state.value || value,
                sections: sections,
                itemTitleFn: this.props.optionNameFn,
                itemDescriptionFn: (item) => item.description,
                itemSelectFn: (item) => {
                    this.props.onChange(this.props.optionValueFn(item));
                    if (this.props.updateImmediately) {
                        this.setState({value: this.props.optionValueFn(item)});
                    }
                    this.toggle();
                }
            }
        ];

        return (
            <PopoverWithTrigger
                ref="popover"
                className={this.props.className}
                triggerElement={triggerElement}
                triggerClasses={"AdminSelect " + (this.props.className || "")}
            >
                <div onClick={(e) => e.stopPropagation()}>
                    <ColumnarSelector
                        columns={columns}
                    />
                </div>
            </PopoverWithTrigger>
        );
    }
}
