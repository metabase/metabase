/* @flow */

import React, { Component } from "react";
import ReactDOM from "react-dom";

import { t } from "c-3po";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import Popover from "metabase/components/Popover";
import Button from "metabase/components/Button";
import RemappedValue from "metabase/containers/RemappedValue";

import Field from "metabase-lib/lib/metadata/Field";

type Props = {
  value: any,
  setValue: () => void,

  isEditing: boolean,

  field: Field,
  parentFocusChanged: boolean => void,
};

type State = {
  value: any[],
  isFocused: boolean,
  widgetWidth: ?number,
};

const BORDER_WIDTH = 2;

const normalizeValue = value =>
  Array.isArray(value) ? value : value != null ? [value] : [];

// TODO: rename this something else since we're using it for more than searching and more than text
export default class ParameterFieldWidget extends Component<*, Props, State> {
  props: Props;
  state: State;

  _unfocusedElement: React$Component<any, any, any>;

  constructor(props: Props) {
    super(props);
    this.state = {
      isFocused: false,
      value: props.value,
      widgetWidth: null,
    };
  }

  static noPopover = true;

  static format(value, field) {
    value = normalizeValue(value);
    if (value.length > 1) {
      return `${value.length} selections`;
    } else {
      return <RemappedValue value={value[0]} column={field} />;
    }
  }

  componentWillReceiveProps(nextProps: Props) {
    if (this.props.value !== nextProps.value) {
      this.setState({ value: nextProps.value });
    }
  }

  componentDidUpdate() {
    let element = ReactDOM.findDOMNode(this._unfocusedElement);
    if (!this.state.isFocused && element) {
      const parameterWidgetElement = element.parentNode.parentNode.parentNode;
      if (parameterWidgetElement.clientWidth !== this.state.widgetWidth) {
        this.setState({ widgetWidth: parameterWidgetElement.clientWidth });
      }
    }
  }

  render() {
    let { setValue, isEditing, field, parentFocusChanged } = this.props;
    let { isFocused } = this.state;

    const savedValue = normalizeValue(this.props.value);
    const unsavedValue = normalizeValue(this.state.value);

    const defaultPlaceholder = isFocused
      ? ""
      : this.props.placeholder || t`Enter a value...`;

    const focusChanged = isFocused => {
      if (parentFocusChanged) {
        parentFocusChanged(isFocused);
      }
      this.setState({ isFocused });
    };

    const placeholder = isEditing
      ? "Enter a default value..."
      : defaultPlaceholder;

    if (!isFocused) {
      return (
        <div
          ref={_ => (this._unfocusedElement = _)}
          className="flex-full cursor-pointer"
          onClick={() => focusChanged(true)}
        >
          {savedValue.length > 0 ? (
            ParameterFieldWidget.format(savedValue, field)
          ) : (
            <span>{placeholder}</span>
          )}
        </div>
      );
    } else {
      return (
        <Popover
          horizontalAttachments={["left", "right"]}
          verticalAttachments={["top"]}
          alignHorizontalEdge
          alignVerticalEdge
          targetOffsetY={-19}
          targetOffsetX={33}
          hasArrow={false}
          onClose={() => focusChanged(false)}
        >
          <FieldValuesWidget
            value={unsavedValue}
            onChange={value => {
              this.setState({ value });
            }}
            placeholder={placeholder}
            field={field}
            searchField={field.parameterSearchField()}
            multi
            autoFocus
            color="brand"
            style={{
              borderWidth: BORDER_WIDTH,
              minWidth: this.state.widgetWidth
                ? this.state.widgetWidth + BORDER_WIDTH * 2
                : null,
            }}
            minWidth={400}
            maxWidth={400}
          />
          {/* border between input and footer comes from border-bottom on FieldValuesWidget */}
          <div className="flex p1">
            <Button
              primary
              className="ml-auto"
              disabled={savedValue.length === 0 && unsavedValue.length === 0}
              onClick={() => {
                setValue(unsavedValue.length > 0 ? unsavedValue : null);
                focusChanged(false);
              }}
            >
              {savedValue.length > 0 ? "Update filter" : "Add filter"}
            </Button>
          </div>
        </Popover>
      );
    }
  }
}
