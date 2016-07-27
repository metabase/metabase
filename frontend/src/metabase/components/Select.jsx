/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import ColumnarSelector from "metabase/components/ColumnarSelector.jsx";
import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import cx from "classnames";

export default class Select extends Component {
    static propTypes = {
        children: PropTypes.any
    };

    render() {
        if (this.props.children) {
            return <BrowserSelect {...this.props} />;
        } else {
            return <LegacySelect {...this.props} />;
        }
    }
}

class BrowserSelect extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            inputValue: ""
        };
    }
    static propTypes = {
        children: PropTypes.array.isRequired,
        className: PropTypes.string,
        value: PropTypes.any,
        onChange: PropTypes.func.isRequired,
        searchProp: PropTypes.string,
        searchCaseInsensitive: PropTypes.bool,
        isInitiallyOpen: PropTypes.bool,
        placeholder: PropTypes.string
    }
    static defaultProps = {
        className: "",
    }

    isSelected(otherValue) {
        const { value } = this.props;
        return (value === otherValue || ((value == null || value === "") && (otherValue == null || otherValue === "")))
    }

    render() {
        const { children, className, onChange, searchProp, searchCaseInsensitive, isInitiallyOpen, placeholder } = this.props;

        let selectedName;
        for (const child of children) {
            if (this.isSelected(child.props.value)) {
                selectedName = child.props.children;
            }
        }
        if (selectedName == null && placeholder) {
            selectedName = placeholder;
        }

        const { inputValue } = this.state;
        let filter = () => true;
        if (searchProp && inputValue) {
            filter = (child) => {
                let childValue = String(child.props[searchProp] || "");
                if (!inputValue) {
                    return false;
                } else if (searchCaseInsensitive) {
                    return childValue.toLowerCase().startsWith(inputValue.toLowerCase())
                } else {
                    return childValue.startsWith(inputValue);
                }
            }
        }

        return (
            <PopoverWithTrigger
                ref="popover"
                className={this.props.className}
                triggerElement={
                    <div className={"flex align-center " + (!this.props.value ? " text-grey-3" : "")}>
                        <span className="mr1">{selectedName}</span>
                        <Icon className="flex-align-right" name="chevrondown" size={12} />
                    </div>
                }
                triggerClasses={cx("AdminSelect", className)}
                verticalAttachments={["top"]}
                isInitiallyOpen={isInitiallyOpen}
            >
                <div className="flex flex-column">
                    { searchProp &&
                        <input
                            className="AdminSelect m1 flex-full"
                            value={inputValue}
                            onChange={(e) => this.setState({ inputValue: e.target.value })}
                            autoFocus
                        />
                    }
                    <div className="ColumnarSelector-column scroll-y" onClick={(e) => e.stopPropagation()}>
                        {children.filter(filter).map(child =>
                            React.cloneElement(child, {
                                selected: this.isSelected(child.props.value),
                                onClick: () => {
                                    if (!child.props.disabled) {
                                        onChange({ target: { value: child.props.value }});
                                    }
                                    this.refs.popover.close()
                                }
                            })
                        )}
                    </div>
                </div>
            </PopoverWithTrigger>
        );
    }
}

export class Option extends Component {
    static propTypes = {
        children: PropTypes.any,
        selected: PropTypes.bool,
        disabled: PropTypes.bool,
        onClick: PropTypes.func
    };

    render() {
        const { children, selected, disabled, onClick } = this.props;
        return (
            <div
                onClick={onClick}
                className={cx("ColumnarSelector-row flex no-decoration", {
                    "ColumnarSelector-row--selected": selected,
                    "disabled": disabled
                })}
            >
                <Icon name="check"  size={14}/>
                {children}
            </div>
        );
    }
}

class LegacySelect extends Component {
    static propTypes = {
        value: PropTypes.any,
        options: PropTypes.array.isRequired,
        placeholder: PropTypes.string,
        onChange: PropTypes.func,
        optionNameFn: PropTypes.func,
        optionValueFn: PropTypes.func,
        className: PropTypes.string,
        //TODO: clean up hardcoded "AdminSelect" class on trigger to avoid this workaround
        triggerClasses: PropTypes.string
    };

    static defaultProps = {
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
                <Icon className="flex-align-right" name="chevrondown" size={12}/>
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
            <PopoverWithTrigger
                ref="popover"
                className={this.props.className}
                triggerElement={triggerElement}
                triggerClasses={this.props.triggerClasses || cx("AdminSelect", this.props.className)}
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
