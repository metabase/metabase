/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import { List } from "react-virtualized";
import "react-virtualized/styles.css";
import { t } from "ttag";
import ColumnarSelector from "metabase/components/ColumnarSelector";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "./SelectButton";

import cx from "classnames";
import _ from "underscore";
import AccordionList from "./AccordionList";
import { createSelector } from "reselect";

import { color } from "metabase/lib/colors";

const MIN_ICON_WIDTH = 20;

import Uncontrollable from "metabase/hoc/Uncontrollable";

@Uncontrollable()
export class Select extends Component {
  static propTypes = {
    // one of these is required
    options: PropTypes.any,
    sections: PropTypes.any,
    children: PropTypes.any,

    value: PropTypes.any.isRequired,
    onChange: PropTypes.func.isRequired,
    multiple: PropTypes.bool,
    placeholder: PropTypes.string,

    // PopoverWithTrigger props
    triggerElement: PropTypes.element,
    triggerClasses: PropTypes.string,
    isInitiallyOpen: PropTypes.bool,

    // AccordianList props
    searchProp: PropTypes.string,
    searchCaseInsensitive: PropTypes.bool,
    searchFuzzy: PropTypes.bool,
  };

  static defaultProps = {};

  constructor(props) {
    super(props);

    this._getValue = props => props.value;
    this._getValues = createSelector(
      [this._getValue],
      value => (Array.isArray(value) ? value : [value]),
    );
    this._getValuesSet = createSelector(
      [this._getValues],
      values => new Set(values),
    );
  }

  _getSections() {
    // normalize `children`/`options` into same format as `sections`
    const { children, sections, options } = this.props;
    if (children) {
      const optionToItem = option => ({
        name: option.props.children,
        ...option.props,
      });
      const first = Array.isArray(children) ? children[0] : children;
      if (first && first.type === SelectSection) {
        return React.Children.map(children, child => ({
          ...child.props,
          items: React.Children.map(child.props.children, optionToItem),
        }));
      } else if (first && first.type === SelectOption) {
        return [{ items: React.Children.map(children, optionToItem) }];
      }
    } else if (options) {
      return [{ items: options || [] }];
    } else if (sections) {
      return sections;
    }
    return [];
  }

  itemIsSelected = option => this._getValuesSet(this.props).has(option.value);
  itemIsClickable = option => !option.disabled;

  handleChange = option => {
    const { multiple, onChange } = this.props;
    let value;
    if (multiple) {
      const values = this._getValues(this.props);
      value = this.itemIsSelected(option)
        ? values.filter(value => value !== option.value)
        : [...values, option.value];
    } else {
      value = option.value;
    }
    onChange({ target: { value } });
    if (!multiple) {
      this._popover.close();
    }
  };

  renderItemIcon = item =>
    this.itemIsSelected(item) ? (
      <Icon
        name="check"
        size={14}
        color={color("text-dark")}
        style={{ minWidth: MIN_ICON_WIDTH }}
      />
    ) : item.icon ? (
      <Icon
        name={item.icon}
        size={item.iconSize || 18}
        color={item.iconColor || color("text-dark")}
        style={{ minWidth: MIN_ICON_WIDTH }}
      />
    ) : (
      <span style={{ minWidth: MIN_ICON_WIDTH }} />
    );

  render() {
    const {
      placeholder,
      searchProp,
      searchCaseInsensitive,
      searchFuzzy,
      triggerElement,
      triggerClasses,
      isInitiallyOpen,
    } = this.props;

    const sections = this._getSections();
    const selectedNames = sections
      .map(section =>
        section.items.filter(this.itemIsSelected).map(item => item.name),
      )
      .flat()
      .filter(n => n);

    return (
      <PopoverWithTrigger
        ref={ref => (this._popover = ref)}
        triggerElement={
          triggerElement || (
            <SelectButton hasValue={selectedNames.length > 0}>
              {selectedNames.length > 0
                ? selectedNames.map((name, index) => (
                    <span key={index}>
                      {name}
                      {index < selectedNames.length - 1 ? ", " : ""}
                    </span>
                  ))
                : placeholder}
            </SelectButton>
          )
        }
        triggerClasses={triggerClasses}
        isInitiallyOpen={isInitiallyOpen}
        verticalAttachments={["top", "bottom"]}
        // keep the popover from jumping around one its been opened,
        // this can happen when filtering items via search
        pinInitialAttachment
      >
        <AccordionList
          sections={sections}
          className="text-brand"
          alwaysExpanded
          itemIsSelected={this.itemIsSelected}
          itemIsClickable={this.itemIsClickable}
          renderItemIcon={this.renderItemIcon}
          onChange={this.handleChange}
          searchable={!!searchProp}
          searchProp={searchProp}
          searchCaseInsensitive={searchCaseInsensitive}
          searchFuzzy={searchFuzzy}
        />
      </PopoverWithTrigger>
    );
  }
}
export class SelectSection extends Component {
  static propTypes = {
    name: PropTypes.any,
    icon: PropTypes.any,
    children: PropTypes.any.isRequired,
  };
  render() {
    return null;
  }
}
export class SelectOption extends Component {
  static propTypes = {
    value: PropTypes.any.isRequired,

    // one of these two is required
    name: PropTypes.any,
    children: PropTypes.any,

    icon: PropTypes.any,
    disabled: PropTypes.bool,
  };
  render() {
    return null;
  }
}

export default class BrowserSelect extends Component {
  state = {
    inputValue: "",
  };

  static propTypes = {
    children: PropTypes.array.isRequired,

    value: PropTypes.any,
    defaultValue: PropTypes.any,
    onChange: PropTypes.func.isRequired,
    multiple: PropTypes.bool,

    className: PropTypes.string,

    searchProp: PropTypes.string,
    searchCaseInsensitive: PropTypes.bool,
    searchFuzzy: PropTypes.bool,

    placeholder: PropTypes.string,

    // popover props
    triggerElement: PropTypes.any,
    isInitiallyOpen: PropTypes.bool,

    height: PropTypes.number,
    width: PropTypes.number,
    rowHeight: PropTypes.number,
    compact: PropTypes.bool,
  };
  static defaultProps = {
    className: "",
    width: 300,
    height: 320,
    rowHeight: 40,
    multiple: false,
    searchCaseInsensitive: true,
    searchFuzzy: true,
  };

  isSelected(otherValue) {
    const { value, multiple, defaultValue } = this.props;
    if (multiple) {
      return _.any(value, v => v === otherValue);
    } else {
      return (
        value === otherValue ||
        ((value == null || value === "") &&
          (otherValue == null || otherValue === "")) ||
        (value == null && otherValue === defaultValue)
      );
    }
  }

  render() {
    const {
      className,
      value,
      onChange,
      searchProp,
      searchCaseInsensitive,
      searchFuzzy,
      isInitiallyOpen,
      placeholder,
      triggerElement,
      width,
      height,
      rowHeight,
      multiple,
    } = this.props;

    let children = _.flatten(this.props.children);

    let selectedNames = children
      .filter(child => this.isSelected(child.props.value))
      .map(child => child.props.children);
    if (_.isEmpty(selectedNames) && placeholder) {
      selectedNames = [placeholder];
    }

    let { inputValue } = this.state;
    let filter = () => true;
    if (searchProp && inputValue) {
      filter = child => {
        let childValue = String(child.props[searchProp] || "");
        if (searchCaseInsensitive) {
          childValue = childValue.toLowerCase();
          inputValue = inputValue.toLowerCase();
        }
        if (searchFuzzy) {
          return childValue.indexOf(inputValue) >= 0;
        } else {
          return childValue.startsWith(inputValue);
        }
      };
    }

    // make sure we filter by the search query
    children = children.filter(filter);

    let extraProps = {};
    if (this.props.compact) {
      extraProps = {
        tetherOptions: {
          attachment: `top left`,
          targetAttachment: `bottom left`,
          targetOffset: `0px 0px`,
        },
        hasArrow: false,
      };
    }

    return (
      <PopoverWithTrigger
        ref="popover"
        className={className}
        triggerElement={
          triggerElement || (
            <SelectButton hasValue={multiple ? value.length > 0 : !!value}>
              {selectedNames.map((name, index) => (
                <span key={index}>
                  {name}
                  {index < selectedNames.length - 1 ? ", " : ""}
                </span>
              ))}
            </SelectButton>
          )
        }
        pinInitialAttachment={
          // keep the popover from jumping around one its been opened,
          // this can happen when filtering items via search
          true
        }
        triggerClasses={className}
        verticalAttachments={["top", "bottom"]}
        isInitiallyOpen={isInitiallyOpen}
        {...extraProps}
      >
        <div className="flex flex-column">
          {searchProp && (
            <input
              className="AdminSelect m1 flex-full"
              value={inputValue}
              onChange={e => this.setState({ inputValue: e.target.value })}
              autoFocus
            />
          )}
          <List
            width={width}
            height={
              // check to see if the height of the number of rows is less than the provided (or default)
              // height. if so, set the height to the number of rows * the row height so that
              // large blank spaces at the bottom are prevented
              children.length * rowHeight < height
                ? children.length * rowHeight
                : height
            }
            rowHeight={rowHeight}
            rowCount={children.length}
            rowRenderer={({ index, key, style }) => {
              const child = children[index];

              /*
               * for each child we need to add props based on
               * the parent's onClick and the current selection
               * status, so we use cloneElement here
               * */
              return (
                <div key={key} style={style} onClick={e => e.stopPropagation()}>
                  {React.cloneElement(children[index], {
                    selected: this.isSelected(child.props.value),
                    onClick: () => {
                      if (!child.props.disabled) {
                        if (multiple) {
                          const value = this.isSelected(child.props.value)
                            ? this.props.value.filter(
                                v => v !== child.props.value,
                              )
                            : this.props.value.concat([child.props.value]);
                          onChange({ target: { value } });
                        } else {
                          onChange({ target: { value: child.props.value } });
                          this.refs.popover.close();
                        }
                      }
                    },
                  })}
                </div>
              );
            }}
          />
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
    onClick: PropTypes.func,
    icon: PropTypes.string,
    iconColor: PropTypes.string,
    iconSize: PropTypes.number,
  };

  render() {
    const {
      children,
      selected,
      disabled,
      icon,
      iconColor,
      iconSize,
      onClick,
    } = this.props;
    return (
      <div
        onClick={onClick}
        className={cx(
          "ColumnarSelector-row flex align-center cursor-pointer no-decoration relative",
          {
            "ColumnarSelector-row--selected": selected,
            disabled: disabled,
          },
        )}
      >
        <Icon name="check" size={14} style={{ position: "absolute" }} />
        {icon && (
          <Icon
            name={icon}
            size={iconSize}
            style={{
              position: "absolute",
              color: iconColor,
              visibility: !selected ? "visible" : "hidden",
            }}
          />
        )}
        <span className="ml4 no-decoration">{children}</span>
      </div>
    );
  }
}

export class LegacySelect extends Component {
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
    triggerClasses: PropTypes.string,
  };

  static defaultProps = {
    placeholder: "",
    emptyPlaceholder: t`Nothing to select`,
    disabledOptionIds: [],
    optionNameFn: option => option.name,
    optionValueFn: option => option,
    isInitiallyOpen: false,
  };

  toggle() {
    this.refs.popover.toggle();
  }

  render() {
    const {
      className,
      value,
      values,
      onChange,
      options,
      disabledOptionIds,
      optionNameFn,
      optionValueFn,
      placeholder,
      emptyPlaceholder,
      isInitiallyOpen,
      disabled,
    } = this.props;

    const selectedName = value
      ? optionNameFn(value)
      : options && options.length > 0
      ? placeholder
      : emptyPlaceholder;

    const triggerElement = (
      <div
        className={cx(
          "flex align-center",
          !value && (!values || values.length === 0) ? " text-medium" : "",
        )}
      >
        {values && values.length !== 0 ? (
          values
            .map(value => optionNameFn(value))
            .sort()
            .map((name, index) => (
              <span key={index} className="mr1">{`${name}${
                index !== values.length - 1 ? ",   " : ""
              }`}</span>
            ))
        ) : (
          <span className="mr1">{selectedName}</span>
        )}
        <Icon className="flex-align-right" name="chevrondown" size={12} />
      </div>
    );

    let sections = {};
    options.forEach(function(option) {
      const sectionName = option.section || "";
      sections[sectionName] = sections[sectionName] || {
        title: sectionName || undefined,
        items: [],
      };
      sections[sectionName].items.push(option);
    });
    sections = Object.keys(sections).map(sectionName => sections[sectionName]);

    const columns = [
      {
        selectedItem: value,
        selectedItems: values,
        sections: sections,
        disabledOptionIds: disabledOptionIds,
        itemTitleFn: optionNameFn,
        itemDescriptionFn: item => item.description,
        itemSelectFn: item => {
          onChange(optionValueFn(item));
          if (!values) {
            this.toggle();
          }
        },
      },
    ];

    const disablePopover = disabled || !options || options.length === 0;

    return (
      <PopoverWithTrigger
        ref="popover"
        className={className}
        triggerElement={triggerElement}
        triggerClasses={
          this.props.triggerClasses || cx("AdminSelect", this.props.className)
        }
        isInitiallyOpen={isInitiallyOpen}
        disabled={disablePopover}
      >
        <div onClick={e => e.stopPropagation()}>
          <ColumnarSelector columns={columns} />
        </div>
      </PopoverWithTrigger>
    );
  }
}
