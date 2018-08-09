/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "c-3po";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";
import DateSingleWidget from "./widgets/DateSingleWidget.jsx";
import DateRangeWidget from "./widgets/DateRangeWidget.jsx";
import DateRelativeWidget from "./widgets/DateRelativeWidget.jsx";
import DateMonthYearWidget from "./widgets/DateMonthYearWidget.jsx";
import DateQuarterYearWidget from "./widgets/DateQuarterYearWidget.jsx";
import DateAllOptionsWidget from "./widgets/DateAllOptionsWidget.jsx";
import CategoryWidget from "./widgets/CategoryWidget.jsx";
import TextWidget from "./widgets/TextWidget.jsx";
import ParameterFieldWidget from "./widgets/ParameterFieldWidget";

import { fetchField, fetchFieldValues } from "metabase/redux/metadata";
import {
  getMetadata,
  makeGetMergedParameterFieldValues,
} from "metabase/selectors/metadata";

import { getParameterIconName } from "metabase/meta/Parameter";

import S from "./ParameterWidget.css";

import cx from "classnames";
import _ from "underscore";

const DATE_WIDGETS = {
  "date/single": DateSingleWidget,
  "date/range": DateRangeWidget,
  "date/relative": DateRelativeWidget,
  "date/month-year": DateMonthYearWidget,
  "date/quarter-year": DateQuarterYearWidget,
  "date/all-options": DateAllOptionsWidget,
};

const makeMapStateToProps = () => {
  const getMergedParameterFieldValues = makeGetMergedParameterFieldValues();
  const mapStateToProps = (state, props) => ({
    metadata: getMetadata(state),
    values: getMergedParameterFieldValues(state, props),
  });
  return mapStateToProps;
};

const mapDispatchToProps = {
  fetchFieldValues,
  fetchField,
};

@connect(makeMapStateToProps, mapDispatchToProps)
export default class ParameterValueWidget extends Component {
  static propTypes = {
    parameter: PropTypes.object.isRequired,
    name: PropTypes.string,
    value: PropTypes.any,
    setValue: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    isEditing: PropTypes.bool,
    noReset: PropTypes.bool,
    commitImmediately: PropTypes.bool,
    focusChanged: PropTypes.func,
    isFullscreen: PropTypes.bool,
    className: PropTypes.string,

    // provided by @connect
    values: PropTypes.array,
    metadata: PropTypes.object.isRequired,
  };

  static defaultProps = {
    values: [],
    isEditing: false,
    noReset: false,
    commitImmediately: false,
    className: "",
  };

  getField() {
    const { parameter, metadata } = this.props;
    return parameter.field_id != null
      ? metadata.fields[parameter.field_id]
      : null;
  }

  getWidget() {
    const { parameter, values } = this.props;
    if (DATE_WIDGETS[parameter.type]) {
      return DATE_WIDGETS[parameter.type];
    } else if (this.getField()) {
      return ParameterFieldWidget;
    } else if (values && values.length > 0) {
      return CategoryWidget;
    } else {
      return TextWidget;
    }
  }

  state = { isFocused: false };

  componentWillMount() {
    // In public dashboards we receive field values before mounting this component and
    // without need to call `fetchFieldValues` separately
    if (_.isEmpty(this.props.values)) {
      this.updateFieldValues(this.props);
    }
  }

  componentWillReceiveProps(nextProps) {
    if (
      nextProps.parameter.field_id != null &&
      nextProps.parameter.field_id !== this.props.parameter.field_id
    ) {
      this.updateFieldValues(nextProps);
    }
  }

  updateFieldValues(props) {
    if (props.parameter.field_id != null) {
      props.fetchField(props.parameter.field_id);
      props.fetchFieldValues(props.parameter.field_id);
    }
  }

  render() {
    const {
      parameter,
      value,
      values,
      setValue,
      isEditing,
      placeholder,
      isFullscreen,
      noReset,
      commitImmediately,
      className,
      focusChanged: parentFocusChanged,
    } = this.props;

    let hasValue = value != null;

    let Widget = this.getWidget();

    const focusChanged = isFocused => {
      if (parentFocusChanged) {
        parentFocusChanged(isFocused);
      }
      this.setState({ isFocused });
    };

    const getParameterTypeIcon = () => {
      if (!isEditing && !hasValue && !this.state.isFocused) {
        return (
          <Icon
            name={getParameterIconName(parameter.type)}
            className="flex-align-left mr1 flex-no-shrink"
            size={14}
          />
        );
      } else {
        return null;
      }
    };

    const getWidgetStatusIcon = () => {
      if (isFullscreen) {
        return null;
      }

      if (hasValue && !noReset) {
        return (
          <Icon
            name="close"
            className="flex-align-right cursor-pointer flex-no-shrink"
            size={12}
            onClick={e => {
              if (hasValue) {
                e.stopPropagation();
                setValue(null);
              }
            }}
          />
        );
      } else if (Widget.noPopover && this.state.isFocused) {
        return (
          <Icon
            name="enterorreturn"
            className="flex-align-right flex-no-shrink"
            size={12}
          />
        );
      } else if (Widget.noPopover) {
        return (
          <Icon
            name="empty"
            className="flex-align-right cursor-pointer flex-no-shrink"
            size={12}
          />
        );
      } else if (!Widget.noPopover) {
        return (
          <Icon
            name="chevrondown"
            className="flex-align-right flex-no-shrink"
            size={12}
          />
        );
      }
    };

    if (Widget.noPopover) {
      return (
        <div
          className={cx(S.parameter, S.noPopover, className, {
            [S.selected]: hasValue,
            [S.isEditing]: isEditing,
          })}
        >
          {getParameterTypeIcon()}
          <Widget
            placeholder={placeholder}
            value={value}
            values={values}
            field={this.getField()}
            setValue={setValue}
            isEditing={isEditing}
            commitImmediately={commitImmediately}
            focusChanged={focusChanged}
          />
          {getWidgetStatusIcon()}
        </div>
      );
    } else {
      let placeholderText = isEditing
        ? t`Select a default value…`
        : placeholder || t`Select…`;

      return (
        <PopoverWithTrigger
          ref="valuePopover"
          triggerElement={
            <div
              ref="trigger"
              className={cx(S.parameter, className, { [S.selected]: hasValue })}
            >
              {getParameterTypeIcon()}
              <div className="mr1 text-nowrap">
                {hasValue ? Widget.format(value, values) : placeholderText}
              </div>
              {getWidgetStatusIcon()}
            </div>
          }
          target={() => this.refs.trigger} // not sure why this is necessary
          // make sure the full date picker will expand to fit the dual calendars
          autoWidth={parameter.type === "date/all-options"}
        >
          <Widget
            value={value}
            values={values}
            setValue={setValue}
            onClose={() => this.refs.valuePopover.close()}
          />
        </PopoverWithTrigger>
      );
    }
  }
}
