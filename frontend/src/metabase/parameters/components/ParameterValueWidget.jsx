import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";
import DateSingleWidget from "./widgets/DateSingleWidget";
import DateRangeWidget from "./widgets/DateRangeWidget";
import DateRelativeWidget from "./widgets/DateRelativeWidget";
import DateMonthYearWidget from "./widgets/DateMonthYearWidget";
import DateQuarterYearWidget from "./widgets/DateQuarterYearWidget";
import DateAllOptionsWidget from "./widgets/DateAllOptionsWidget";
import TextWidget from "./widgets/TextWidget";
import ParameterFieldWidget from "./widgets/ParameterFieldWidget/ParameterFieldWidget";
import Tooltip from "metabase/components/Tooltip";

import { fetchField, fetchFieldValues } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import { getParameterIconName } from "metabase/parameters/utils/ui";
import { deriveFieldOperatorFromParameter } from "metabase/parameters/utils/operators";
import { isDashboardParameterWithoutMapping } from "metabase/parameters/utils/dashboards";
import { hasFieldValues } from "metabase/parameters/utils/fields";

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
  const mapStateToProps = (state, props) => ({
    metadata: getMetadata(state),
  });
  return mapStateToProps;
};

const mapDispatchToProps = {
  fetchFieldValues,
  fetchField,
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

    metadata: PropTypes.object.isRequired,
  };

  static defaultProps = {
    isEditing: false,
    noReset: false,
    commitImmediately: false,
    className: "",
  };

  state = { isFocused: false };

  constructor(props) {
    super(props);

    // In public dashboards we receive field values before mounting this component and
    // without need to call `fetchFieldValues` separately
    if (!hasFieldValues(this.props.parameter)) {
      this.updateFieldValues(this.props);
    }

    this.valuePopover = React.createRef();
    this.trigger = React.createRef();
  }

  componentDidUpdate(prevProps) {
    if (
      !_.isEqual(
        getFieldIds(prevProps.parameter),
        getFieldIds(this.props.parameter),
      )
    ) {
      this.updateFieldValues(this.props);
    }
  }

  updateFieldValues({ dashboard, parameter, fetchField, fetchFieldValues }) {
    // in a dashboard? the field values will be fetched via
    // DashboardApi.parameterValues instead and thus, no need to
    // manually update field values
    const useChainFilter = dashboard && dashboard.id;
    if (!useChainFilter) {
      for (const id of getFieldIds(parameter)) {
        fetchField(id);
        fetchFieldValues(id);
      }
    }
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
      metadata,
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
    const WidgetDefinition = getWidgetDefinition(metadata, parameter);
    const { noPopover } = WidgetDefinition;
    const showTypeIcon = !isEditing && !hasValue && !isFocused;

    if (noPopover) {
      return (
        <Tooltip
          tooltip={isDashParamWithoutMappingText}
          isEnabled={isDashParamWithoutMapping}
        >
          <div
            className={cx(S.parameter, S.noPopover, className, {
              [S.selected]: hasValue,
              [S.isEditing]: isEditing,
            })}
          >
            {showTypeIcon && <ParameterTypeIcon parameter={parameter} />}
            <Widget
              {...this.props}
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
        ? t`Select a default value…`
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
                {showTypeIcon && <ParameterTypeIcon parameter={parameter} />}
                <div className="mr1 text-nowrap">
                  {hasValue ? WidgetDefinition.format(value) : placeholderText}
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

export default connect(
  makeMapStateToProps,
  mapDispatchToProps,
)(ParameterValueWidget);

function getFields(metadata, parameter) {
  if (!metadata) {
    return [];
  }
  return (
    parameter.fields ??
    getFieldIds(parameter)
      .map(id => metadata.field(id))
      .filter(f => f != null)
  );
}

function getFieldIds(parameter) {
  const { field_ids = [], field_id } = parameter;
  const fieldIds = field_id ? [field_id] : field_ids;
  return fieldIds.filter(id => typeof id === "number");
}

function Widget({
  parameter,
  metadata,
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
}) {
  const DateWidget = DATE_WIDGETS[parameter.type];
  const fields = getFields(metadata, parameter);

  if (disabled) {
    return (
      <TextWidget
        className={cx(className, "cursor-not-allowed")}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  }

  if (DateWidget) {
    return (
      <DateWidget value={value} setValue={setValue} onClose={onPopoverClose} />
    );
  } else if (fields.length > 0 && parameter.hasOnlyFieldTargets) {
    return (
      <ParameterFieldWidget
        parameter={parameter}
        parameters={parameters}
        dashboard={dashboard}
        placeholder={placeholder}
        value={value}
        fields={fields}
        setValue={setValue}
        isEditing={isEditing}
        focusChanged={onFocusChanged}
        operator={deriveFieldOperatorFromParameter(parameter)}
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

function getWidgetDefinition(metadata, parameter) {
  if (DATE_WIDGETS[parameter.type]) {
    return DATE_WIDGETS[parameter.type];
  } else if (
    getFields(metadata, parameter).length > 0 &&
    parameter.hasOnlyFieldTargets
  ) {
    return ParameterFieldWidget;
  } else {
    return TextWidget;
  }
}

function ParameterTypeIcon({ parameter }) {
  return (
    <Icon
      name={getParameterIconName(parameter)}
      className="flex-align-left mr1 flex-no-shrink"
      size={14}
    />
  );
}

ParameterTypeIcon.propTypes = {
  parameter: PropTypes.object.isRequired,
};

function WidgetStatusIcon({
  isFullscreen,
  hasValue,
  noReset,
  noPopover,
  isFocused,
  setValue,
}) {
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
  } else if (noPopover && isFocused) {
    return (
      <Icon
        name="enter_or_return"
        className="flex-align-right flex-no-shrink"
        size={12}
      />
    );
  } else if (noPopover) {
    return (
      <Icon
        name="empty"
        className="flex-align-right cursor-pointer flex-no-shrink"
        size={12}
      />
    );
  } else if (!noPopover) {
    return (
      <Icon
        name="chevrondown"
        className="flex-align-right flex-no-shrink"
        size={12}
      />
    );
  }

  return null;
}

WidgetStatusIcon.propTypes = {
  isFullscreen: PropTypes.bool.isRequired,
  hasValue: PropTypes.bool.isRequired,
  noReset: PropTypes.bool.isRequired,
  noPopover: PropTypes.bool.isRequired,
  isFocused: PropTypes.bool.isRequired,
  setValue: PropTypes.func.isRequired,
};
