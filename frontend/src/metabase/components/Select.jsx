/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

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
        const { className, children, value, onChange, searchProp, searchCaseInsensitive, isInitiallyOpen, placeholder } = this.props;

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
                className={className}
                triggerElement={<SelectButton hasValue={!!value}>{selectedName}</SelectButton>}
                triggerClasses={className}
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

export const SelectButton = ({ hasValue, children }) =>
    <div className={"AdminSelect flex align-center " + (!hasValue ? " text-grey-3" : "")}>
        <span className="AdminSelect-content mr1">{children}</span>
        <Icon className="AdminSelect-chevron flex-align-right" name="chevrondown" size={12} />
    </div>

SelectButton.propTypes = {
    hasValue: PropTypes.bool,
    children: PropTypes.any,
};

export class Option extends Component {
    static propTypes = {
        children:   PropTypes.any,
        selected:   PropTypes.bool,
        disabled:   PropTypes.bool,
        onClick:    PropTypes.func,
        icon:       PropTypes.string,
        iconColor:  PropTypes.string,
        iconSize:   PropTypes.number,
    };

    render() {
        const { children, selected, disabled, icon, iconColor, iconSize, onClick } = this.props;
        return (
            <div
                onClick={onClick}
                className={cx("ColumnarSelector-row flex align-center cursor-pointer no-decoration relative", {
                    "ColumnarSelector-row--selected": selected,
                    "disabled": disabled
                })}
            >
                <Icon name="check" size={14} style={{ position: 'absolute' }} />
                { icon &&
                    <Icon
                        name={icon}
                        size={iconSize}
                        style={{
                            position: 'absolute',
                            color: iconColor,
                            visibility: !selected ? "visible" : "hidden"
                        }}
                    />
                }
                <span className="ml4">{children}</span>
            </div>
        );
    }
}

class LegacySelect extends Component {
    static propTypes = {
        value: PropTypes.any,
        values: PropTypes.array,
        options: PropTypes.array.isRequired,
        disabledOptionIds: PropTypes.array,
        placeholder: PropTypes.string,
        emptyPlaceholder: PropTypes.string,
        onChange: PropTypes.func,
        optionNameFn: PropTypes.func,
        optionValueFn: PropTypes.func,
        className: PropTypes.string,
        isInitiallyOpen: PropTypes.bool,
        disabled: PropTypes.bool,
        //TODO: clean up hardcoded "AdminSelect" class on trigger to avoid this workaround
        triggerClasses: PropTypes.string
    };

    static defaultProps = {
        placeholder: "",
        emptyPlaceholder: "Nothing to select",
        disabledOptionIds: [],
        optionNameFn: (option) => option.name,
        optionValueFn: (option) => option,
        isInitiallyOpen: false,
    };

    toggle() {
        this.refs.popover.toggle();
    }

    render() {
        const { className, value, values, onChange, options, disabledOptionIds, optionNameFn, optionValueFn, placeholder, emptyPlaceholder, isInitiallyOpen, disabled } = this.props;

        var selectedName = value ?
            optionNameFn(value) :
            options && options.length > 0 ?
                placeholder :
                emptyPlaceholder;

        var triggerElement = (
            <div className={cx("flex align-center", !value && (!values || values.length === 0) ? " text-grey-2" : "")}>
                { values && values.length !== 0 ?
                    values
                        .map(value => optionNameFn(value))
                        .sort()
                        .map((name, index) => <span key={index} className="mr1">{`${name}${index !== (values.length - 1) ? ',   ' : ''}`}</span>) :
                    <span className="mr1">{selectedName}</span>
                }
                <Icon className="flex-align-right" name="chevrondown" size={12}/>
            </div>
        );

        var sections = {};
        options.forEach(function (option) {
            var sectionName = option.section || "";
            sections[sectionName] = sections[sectionName] || { title: sectionName || undefined, items: [] };
            sections[sectionName].items.push(option);
        });
        sections = Object.keys(sections).map((sectionName) => sections[sectionName]);

        var columns = [
            {
                selectedItem: value,
                selectedItems: values,
                sections: sections,
                disabledOptionIds: disabledOptionIds,
                itemTitleFn: optionNameFn,
                itemDescriptionFn: (item) => item.description,
                itemSelectFn: (item) => {
                    onChange(optionValueFn(item));
                    if (!values) {
                        this.toggle();
                    }
                }
            }
        ];

        const disablePopover = disabled || !options || options.length === 0;

        return (
            <PopoverWithTrigger
                ref="popover"
                className={className}
                triggerElement={triggerElement}
                triggerClasses={this.props.triggerClasses || cx("AdminSelect", this.props.className)}
                isInitiallyOpen={isInitiallyOpen}
                disabled={disablePopover}
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
