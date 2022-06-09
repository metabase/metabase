import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import { getParameterIconName } from "metabase/parameters/utils/ui";
import { isDashboardParameterWithoutMapping } from "metabase/parameters/utils/dashboards";
import { isOnlyMappedToFields } from "metabase/parameters/utils/fields";
import { isDateParameter } from "metabase/parameters/utils/parameter-type";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";
import DateSingleWidget from "metabase/components/DateSingleWidget";
import DateRangeWidget from "metabase/components/DateRangeWidget";
import DateRelativeWidget from "metabase/components/DateRelativeWidget";
import DateMonthYearWidget from "metabase/components/DateMonthYearWidget";
import DateQuarterYearWidget from "metabase/components/DateQuarterYearWidget";
import DateAllOptionsWidget from "metabase/components/DateAllOptionsWidget";
import Tooltip from "metabase/components/Tooltip";
import TextWidget from "metabase/components/TextWidget";
import WidgetStatusIcon from "metabase/parameters/components/WidgetStatusIcon";
import FormattedParameterValue from "metabase/parameters/components/FormattedParameterValue";

import ParameterFieldWidget from "./widgets/ParameterFieldWidget/ParameterFieldWidget";
import S from "./ParameterWidget.css";

const DATE_WIDGETS = {
  "date/single": DateSingleWidget,
  "date/range": DateRangeWidget,
  "date/relative": DateRelativeWidget,
  "date/month-year": DateMonthYearWidget,
  "date/quarter-year": DateQuarterYearWidget,
  "date/all-options": DateAllOptionsWidget,
};

class ParameterValueWidget extends Component {
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
    parameters: PropTypes.array,
    dashboard: PropTypes.object,
  };

  state = { isFocused: false };

  constructor(props) {
    super(props);

    this.valuePopover = React.createRef();
    this.trigger = React.createRef();
  }

  onFocusChanged = isFocused => {
    const { focusChanged: parentFocusChanged } = this.props;
    if (parentFocusChanged) {
      parentFocusChanged(isFocused);
    }
    this.setState({ isFocused });
  };

  onPopoverClose = () => {
    if (this.valuePopover.current) {
      this.valuePopover.current.close();
    }
  };

  getTargetRef = () => {
    return this.trigger.current;
  };

  render() {
    const {
      parameter,
      value,
      setValue,
      isEditing,
      placeholder,
      isFullscreen,
      noReset,
      className,
      dashboard,
    } = this.props;
    const { isFocused } = this.state;
    const hasValue = value != null;
    const isDashParamWithoutMapping = isDashboardParameterWithoutMapping(
      parameter,
      dashboard,
    );
    const isDashParamWithoutMappingText = t`This filter needs to be connected to a card.`;
    const { noPopover } = getWidgetDefinition(parameter);
    const parameterTypeIcon = getParameterIconName(parameter);
    const showTypeIcon = !isEditing && !hasValue && !isFocused;

    if (noPopover) {
      return (
        <Tooltip
          tooltip={isDashParamWithoutMappingText}
          isEnabled={isDashParamWithoutMapping}
        >
          <div
            ref={this.trigger}
            className={cx(S.parameter, S.noPopover, className, {
              [S.selected]: hasValue,
              [S.isEditing]: isEditing,
            })}
          >
            {showTypeIcon && (
              <Icon
                name={parameterTypeIcon}
                className="flex-align-left mr1 flex-no-shrink"
                size={14}
              />
            )}
            <Widget
              {...this.props}
              target={this.getTargetRef()}
              onFocusChanged={this.onFocusChanged}
              onPopoverClose={this.onPopoverClose}
              disabled={isDashParamWithoutMapping}
            />
            <WidgetStatusIcon
              isFullscreen={isFullscreen}
              hasValue={hasValue}
              noReset={noReset}
              noPopover={!!noPopover}
              isFocused={isFocused}
              setValue={setValue}
            />
          </div>
        </Tooltip>
      );
    } else {
      const placeholderText = isEditing
        ? isDateParameter(parameter)
          ? t`Select a default value…`
          : t`Enter a default value…`
        : placeholder || t`Select…`;

      return (
        <Tooltip
          tooltip={isDashParamWithoutMappingText}
          isEnabled={isDashParamWithoutMapping}
        >
          <PopoverWithTrigger
            ref={this.valuePopover}
            triggerElement={
              <div
                ref={this.trigger}
                className={cx(S.parameter, className, {
                  [S.selected]: hasValue,
                  "cursor-not-allowed": isDashParamWithoutMapping,
                })}
              >
                {showTypeIcon && (
                  <Icon
                    name={parameterTypeIcon}
                    className="flex-align-left mr1 flex-no-shrink"
                    size={14}
                  />
                )}
                <div className="mr1 text-nowrap">
                  <FormattedParameterValue
                    parameter={parameter}
                    value={value}
                    placeholder={placeholderText}
                  />
                </div>
                <WidgetStatusIcon
                  isFullscreen={isFullscreen}
                  hasValue={hasValue}
                  noReset={noReset}
                  noPopover={!!noPopover}
                  isFocused={isFocused}
                  setValue={setValue}
                />
              </div>
            }
            target={this.getTargetRef}
            // make sure the full date picker will expand to fit the dual calendars
            autoWidth={parameter.type === "date/all-options"}
          >
            <Widget
              {...this.props}
              target={this.getTargetRef()}
              onFocusChanged={this.onFocusChanged}
              onPopoverClose={this.onPopoverClose}
              disabled={isDashParamWithoutMapping}
            />
          </PopoverWithTrigger>
        </Tooltip>
      );
    }
  }
}

export default ParameterValueWidget;

function Widget({
  parameter,
  value,
  setValue,
  onPopoverClose,
  className,
  isEditing,
  commitImmediately,
  placeholder,
  onFocusChanged,
  parameters,
  dashboard,
  disabled,
  target,
}) {
  if (disabled) {
    return (
      <TextWidget
        className={cx(className, "cursor-not-allowed")}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  }

  const DateWidget = DATE_WIDGETS[parameter.type];
  if (DateWidget) {
    return (
      <DateWidget value={value} setValue={setValue} onClose={onPopoverClose} />
    );
  } else if (isOnlyMappedToFields(parameter)) {
    return (
      <ParameterFieldWidget
        target={target}
        parameter={parameter}
        parameters={parameters}
        dashboard={dashboard}
        placeholder={placeholder}
        value={value}
        fields={parameter.fields}
        setValue={value => {
          setValue(value);
          onPopoverClose();
        }}
        isEditing={isEditing}
        focusChanged={onFocusChanged}
      />
    );
  } else {
    return (
      <TextWidget
        value={value}
        setValue={setValue}
        className={className}
        isEditing={isEditing}
        commitImmediately={commitImmediately}
        placeholder={placeholder}
        focusChanged={onFocusChanged}
      />
    );
  }
}

Widget.propTypes = {
  ...ParameterValueWidget.propTypes,
  onPopoverClose: PropTypes.func.isRequired,
  onFocusChanged: PropTypes.func.isRequired,
};

function getWidgetDefinition(parameter) {
  if (DATE_WIDGETS[parameter.type]) {
    return DATE_WIDGETS[parameter.type];
  } else if (isOnlyMappedToFields(parameter)) {
    return ParameterFieldWidget;
  } else {
    return TextWidget;
  }
}
