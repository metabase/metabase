import type {
  CSSProperties,
  Key,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import { createRef, Children, Component } from "react";

import _ from "underscore";
import cx from "classnames";
import { createSelector } from "@reduxjs/toolkit";
import type { IconName } from "metabase/core/components/Icon";
import { Icon } from "metabase/core/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import type { SelectButtonProps } from "metabase/core/components/SelectButton";
import SelectButton from "metabase/core/components/SelectButton";

import { color } from "metabase/lib/colors";

import Uncontrollable from "metabase/hoc/Uncontrollable";
import { composeEventHandlers } from "metabase/lib/compose-event-handlers";
import { SelectAccordionList } from "./Select.styled";

const MIN_ICON_WIDTH = 20;

export interface SelectProps<TValue, TOption = SelectOption<TValue>> {
  className?: string;

  options?: TOption[];
  sections?: SelectSection<TOption>[];
  children?: ReactNode;

  value: TValue;
  name?: string;
  defaultValue?: TValue;
  onChange?: (event: SelectChangeEvent<TValue>) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  hiddenIcons?: boolean;

  // PopoverWithTrigger props
  isInitiallyOpen?: boolean;
  triggerElement?: ReactNode;
  onClose?: () => void;

  // SelectButton props
  buttonProps?: Partial<SelectButtonProps>;
  buttonText?: string; // will override selected options text

  // AccordionList props
  searchProp?: string;
  searchCaseInsensitive?: boolean;
  searchPlaceholder?: string;
  searchFuzzy?: boolean;
  hideEmptySectionsInSearch?: boolean;
  width?: number;

  optionNameFn?: (option: TOption) => string | undefined;
  optionValueFn?: (option: TOption) => TValue;
  optionDescriptionFn?: (option: TOption) => string | undefined;
  optionSectionFn?: (option: TOption) => string;
  optionDisabledFn?: (option: TOption) => boolean;
  optionIconFn?: (option: TOption) => IconName | undefined;
  optionClassNameFn?: (option: TOption) => string | undefined;
  optionStylesFn?: (option: TOption) => CSSProperties | undefined;

  footer?: ReactNode;
  "data-testid"?: string;
}

export interface SelectOption<TValue = Key> {
  value: TValue;
  name?: string;
  description?: string;
  icon?: IconName;
  iconSize?: number;
  iconColor?: string;
  disabled?: boolean;
  children?: ReactNode;
}

export interface SelectSection<TOption = SelectOption> {
  name?: string;
  icon?: IconName;
  items: TOption[];
}

export interface SelectChangeEvent<TValue> {
  target: SelectChangeTarget<TValue>;
}

export interface SelectChangeTarget<TValue> {
  name?: string;
  value: TValue;
}

class BaseSelect<TValue, TOption = SelectOption<TValue>> extends Component<
  SelectProps<TValue, TOption>
> {
  _popover?: any;
  selectButtonRef: RefObject<any>;
  _getValues: () => TValue[];
  _getValuesSet: () => Set<TValue>;

  static defaultProps = {
    optionNameFn: (option: SelectOption) => option.children || option.name,
    optionValueFn: (option: SelectOption) => option.value,
    optionDescriptionFn: (option: SelectOption) => option.description,
    optionDisabledFn: (option: SelectOption) => option.disabled,
    optionIconFn: (option: SelectOption) => option.icon,
  };

  constructor(props: SelectProps<TValue, TOption>) {
    super(props);

    // reselect selectors
    const _getValue = (props: SelectProps<TValue, TOption>) =>
      // If a defaultValue is passed, replace a null value with it.
      // Otherwise, allow null values since we sometimes want them.
      Object.prototype.hasOwnProperty.call(props, "defaultValue") &&
      props.value == null
        ? (props.defaultValue as any)
        : props.value;

    const _getValues = createSelector([_getValue], value =>
      Array.isArray(value) ? value : [value],
    );
    const _getValuesSet = createSelector(
      [_getValues],
      values => new Set(values),
    );
    this._getValues = () => _getValues(this.props);
    this._getValuesSet = () => _getValuesSet(this.props);
    this.selectButtonRef = createRef();
  }

  _getSections(): SelectSection<TOption>[] {
    // normalize `children`/`options` into same format as `sections`
    const { children, sections, options } = this.props;
    if (children) {
      const optionToItem = (option: any) => option.props;
      const first = (Array.isArray(children) ? children[0] : children) as any;
      if (first && (first as ReactElement).type === OptionSection) {
        return Children.map(children, child => ({
          ...(child as ReactElement<OptionProps<TValue>>).props,
          items: Children.map((child as any).props.children, optionToItem),
        })) as any;
      } else if (first && first.type === Option) {
        return [{ items: Children.map(children, optionToItem) }] as any;
      }
    } else if (options) {
      if (this.props.optionSectionFn) {
        return _.chain(options)
          .groupBy(this.props.optionSectionFn)
          .pairs()
          .map(([section, items]) => ({ name: section, items }))
          .value();
      } else {
        return [{ items: options }];
      }
    } else if (sections) {
      return sections;
    }
    return [];
  }

  itemIsSelected = (option: TOption) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const optionValue = this.props.optionValueFn!(option);
    return this._getValuesSet().has(optionValue);
  };

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  itemIsClickable = (option: TOption) => !this.props.optionDisabledFn!(option);

  handleChange = (option: TOption) => {
    const { name, multiple, onChange } = this.props;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const optionValue = this.props.optionValueFn!(option);
    let value: any;
    if (multiple) {
      const values = this._getValues();
      value = this.itemIsSelected(option)
        ? values.filter(value => value !== optionValue)
        : [...values, optionValue];
      value.changedItem = optionValue;
    } else {
      value = optionValue;
    }
    onChange?.({ target: { name, value } });
    if (!multiple) {
      this._popover?.close();
      this.handleClose();
    }
  };

  renderItemIcon = (item: TOption) => {
    if (this.props.hiddenIcons) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const icon = this.props.optionIconFn!(item);
    if (icon) {
      return (
        <Icon
          name={icon}
          size={(item as any).iconSize || 16}
          color={(item as any).iconColor || color("text-dark")}
          style={{ minWidth: MIN_ICON_WIDTH }}
        />
      );
    }

    if (this.itemIsSelected(item)) {
      return (
        <Icon
          name="check"
          color={color("text-dark")}
          style={{ minWidth: MIN_ICON_WIDTH }}
        />
      );
    }

    return <span style={{ minWidth: MIN_ICON_WIDTH }} />;
  };

  handleClose = () => {
    // Focusing in the next tick prevents it is from reopening
    // when closed by selecting an item with Enter
    setTimeout(() => {
      this.selectButtonRef.current?.focus();
    }, 0);
  };

  render() {
    const {
      buttonProps,
      className,
      placeholder,
      searchProp,
      searchCaseInsensitive,
      searchPlaceholder,
      searchFuzzy,
      hideEmptySectionsInSearch,
      isInitiallyOpen,
      onClose,
      disabled,
      width,
      footer,
      "data-testid": testId,
    } = this.props;

    const sections = this._getSections();
    const selectedNames = sections
      .map(section =>
        this.props.optionNameFn
          ? section.items
              .filter(this.itemIsSelected)
              .map(this.props.optionNameFn)
          : [],
      )
      .flat()
      .filter(n => n);

    return (
      <PopoverWithTrigger
        ref={ref => (this._popover = ref)}
        triggerElement={
          this.props.triggerElement || (
            <SelectButton
              ref={this.selectButtonRef}
              className="flex-full"
              hasValue={selectedNames.length > 0}
              disabled={disabled}
              {...buttonProps}
            >
              {this.props.buttonText
                ? this.props.buttonText
                : selectedNames.length > 0
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
        onClose={composeEventHandlers(onClose, this.handleClose)}
        triggerClasses={cx("flex", className)}
        isInitiallyOpen={isInitiallyOpen}
        disabled={disabled}
        verticalAttachments={["top", "bottom"]}
        // keep the popover from jumping around one its been opened,
        // this can happen when filtering items via search
        pinInitialAttachment
      >
        <SelectAccordionList
          hasInitialFocus
          sections={sections}
          className="MB-Select"
          alwaysExpanded
          width={width}
          role="listbox"
          itemIsSelected={this.itemIsSelected}
          itemIsClickable={this.itemIsClickable}
          renderItemName={this.props.optionNameFn}
          getItemClassName={this.props.optionClassNameFn}
          getItemStyles={this.props.optionStylesFn}
          renderItemDescription={this.props.optionDescriptionFn}
          renderItemIcon={this.renderItemIcon}
          onChange={this.handleChange}
          searchable={!!searchProp}
          searchProp={searchProp}
          searchCaseInsensitive={searchCaseInsensitive}
          searchFuzzy={searchFuzzy}
          searchPlaceholder={searchPlaceholder}
          hideEmptySectionsInSearch={hideEmptySectionsInSearch}
          data-testid={testId ? `${testId}-list` : null}
        />
        {footer}
      </PopoverWithTrigger>
    );
  }
}

/**
 * @deprecated: use Select from "metabase/ui"
 */
const Select = Uncontrollable()(BaseSelect);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Select;

export interface OptionSectionProps {
  name?: string;
  icon?: IconName;
  children?: ReactNode;
}

export class OptionSection extends Component<OptionSectionProps> {
  render() {
    return null;
  }
}

export interface OptionProps<TValue> {
  value: TValue;

  // one of these two is required
  name?: string;
  children?: ReactNode;

  icon?: IconName;
  disabled?: boolean;
}

export class Option<TValue> extends Component<OptionProps<TValue>> {
  render() {
    return null;
  }
}
