import { createRef, Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import {
  getParameterIconName,
  getParameterWidgetTitle,
} from "metabase/parameters/utils/ui";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { Icon } from "metabase/core/components/Icon";
import DateSingleWidget from "metabase/components/DateSingleWidget";
import DateRangeWidget from "metabase/components/DateRangeWidget";
import DateRelativeWidget from "metabase/components/DateRelativeWidget";
import DateMonthYearWidget from "metabase/components/DateMonthYearWidget";
import DateQuarterYearWidget from "metabase/components/DateQuarterYearWidget";
import DateAllOptionsWidget from "metabase/components/DateAllOptionsWidget";
import TextWidget from "metabase/components/TextWidget";
import WidgetStatusIcon from "metabase/parameters/components/WidgetStatusIcon";
import FormattedParameterValue from "metabase/parameters/components/FormattedParameterValue";
import NumberInputWidget from "metabase/parameters/components/widgets/NumberInputWidget";
import StringInputWidget from "metabase/parameters/components/widgets/StringInputWidget";
import {
  getNumberParameterArity,
  getStringParameterArity,
} from "metabase-lib/parameters/utils/operators";
import { getFields } from "metabase-lib/parameters/utils/parameter-fields";
import { getQueryType } from "metabase-lib/parameters/utils/parameter-source";
import {
  isDateParameter,
  isNumberParameter,
} from "metabase-lib/parameters/utils/parameter-type";

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

    this.valuePopover = createRef();
    this.trigger = createRef();
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
    } = this.props;
    const { isFocused } = this.state;
    const hasValue = value != null;
    const { noPopover } = getWidgetDefinition(parameter);
    const parameterTypeIcon = getParameterIconName(parameter);
    const showTypeIcon = !isEditing && !hasValue && !isFocused;

    if (noPopover) {
      return (
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
              size={16}
            />
          )}
          <Widget
            {...this.props}
            target={this.getTargetRef()}
            onFocusChanged={this.onFocusChanged}
            onPopoverClose={this.onPopoverClose}
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
      );
    } else {
      const placeholderText = isEditing
        ? isDateParameter(parameter)
          ? t`Select a default value…`
          : t`Enter a default value…`
        : placeholder || t`Select…`;

      return (
        <PopoverWithTrigger
          ref={this.valuePopover}
          targetOffsetX={16}
          triggerElement={
            <div
              ref={this.trigger}
              className={cx(S.parameter, className, {
                [S.selected]: hasValue,
              })}
              role="button"
              aria-label={placeholder}
            >
              {showTypeIcon && (
                <Icon
                  name={parameterTypeIcon}
                  className="flex-align-left mr1 flex-no-shrink"
                  size={16}
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
          />
        </PopoverWithTrigger>
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
  question,
  dashboard,
  target,
}) {
  const normalizedValue = Array.isArray(value)
    ? value
    : [value].filter(v => v != null);

  if (isDateParameter(parameter)) {
    const DateWidget = DATE_WIDGETS[parameter.type];
    return (
      <DateWidget value={value} setValue={setValue} onClose={onPopoverClose} />
    );
  } else if (isTextWidget(parameter)) {
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
  } else if (isNumberParameter(parameter)) {
    const arity = getNumberParameterArity(parameter);
    return (
      <NumberInputWidget
        value={normalizedValue}
        setValue={value => {
          setValue(value);
          onPopoverClose();
        }}
        arity={arity}
        infixText={typeof arity === "number" && arity > 1 ? t`and` : undefined}
        autoFocus
        placeholder={isEditing ? t`Enter a default value…` : undefined}
        label={getParameterWidgetTitle(parameter)}
      />
    );
  } else if (isFieldWidget(parameter)) {
    return (
      <ParameterFieldWidget
        target={target}
        parameter={parameter}
        parameters={parameters}
        question={question}
        dashboard={dashboard}
        placeholder={placeholder}
        value={normalizedValue}
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
      <StringInputWidget
        value={normalizedValue}
        setValue={value => {
          setValue(value);
          onPopoverClose();
        }}
        className={className}
        autoFocus
        placeholder={isEditing ? t`Enter a default value…` : undefined}
        arity={getStringParameterArity(parameter)}
        label={getParameterWidgetTitle(parameter)}
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
  } else if (isTextWidget(parameter)) {
    return TextWidget;
  } else if (isNumberParameter(parameter)) {
    return NumberInputWidget;
  } else if (isFieldWidget(parameter)) {
    return ParameterFieldWidget;
  } else {
    return StringInputWidget;
  }
}

function isTextWidget(parameter) {
  const canQuery = getQueryType(parameter) !== "none";
  return parameter.hasVariableTemplateTagTarget && !canQuery;
}

function isFieldWidget(parameter) {
  const canQuery = getQueryType(parameter) !== "none";
  const hasFields = getFields(parameter).length > 0;

  return parameter.hasVariableTemplateTagTarget
    ? canQuery
    : canQuery || hasFields;
}
