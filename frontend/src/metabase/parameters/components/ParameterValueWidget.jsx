import { createRef, Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import {
  getParameterIconName,
  getParameterWidgetTitle,
} from "metabase/parameters/utils/ui";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { Icon } from "metabase/ui";
import DateSingleWidget from "metabase/components/DateSingleWidget";
import DateRangeWidget from "metabase/components/DateRangeWidget";
import DateRelativeWidget from "metabase/components/DateRelativeWidget";
import DateMonthYearWidget from "metabase/components/DateMonthYearWidget";
import DateQuarterYearWidget from "metabase/components/DateQuarterYearWidget";
import { DateAllOptionsWidget } from "metabase/components/DateAllOptionsWidget";
import { TextWidget } from "metabase/components/TextWidget";
import { WidgetStatusIcon } from "metabase/parameters/components/WidgetStatusIcon";
import FormattedParameterValue from "metabase/parameters/components/FormattedParameterValue";
import NumberInputWidget from "metabase/parameters/components/widgets/NumberInputWidget";
import StringInputWidget from "metabase/parameters/components/widgets/StringInputWidget";
import {
  getNumberParameterArity,
  getStringParameterArity,
} from "metabase-lib/parameters/utils/operators";
import { getQueryType } from "metabase-lib/parameters/utils/parameter-source";
import {
  isDateParameter,
  isNumberParameter,
} from "metabase-lib/parameters/utils/parameter-type";
import { hasFields } from "metabase-lib/parameters/utils/parameter-fields";

import ParameterFieldWidget from "./widgets/ParameterFieldWidget/ParameterFieldWidget";
import S from "./ParameterValueWidget.css";

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

  getWidgetStatusIcon = () => {
    if (this.props.isFullscreen) {
      return null;
    }

    if (this.props.value != null) {
      return (
        <WidgetStatusIcon
          name="close"
          onClick={() => this.props.setValue(null)}
        />
      );
    }

    const noPopover = hasNoPopover(this.props.parameter);

    if (noPopover && this.state.isFocused) {
      return <WidgetStatusIcon name="enter_or_return" />;
    }

    if (!noPopover) {
      return <WidgetStatusIcon name="chevrondown" />;
    }

    // This is required to keep input width constant
    return <WidgetStatusIcon name="empty" />;
  };

  render() {
    const { parameter, value, isEditing, placeholder, className } = this.props;
    const { isFocused } = this.state;
    const hasValue = value != null;
    const noPopover = hasNoPopover(parameter);
    const parameterTypeIcon = getParameterIconName(parameter);
    const showTypeIcon = !isEditing && !hasValue && !isFocused;

    if (noPopover) {
      return (
        <div
          ref={this.trigger}
          className={cx(S.parameter, S.noPopover, className, {
            [S.selected]: hasValue,
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
          {this.getWidgetStatusIcon()}
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
              {this.getWidgetStatusIcon()}
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

function hasNoPopover(parameter) {
  // This is needed because isTextWidget check isn't complete,
  // and returns true for dates too.
  if (isDateParameter(parameter)) {
    return false;
  }
  return isTextWidget(parameter);
}

function isTextWidget(parameter) {
  const canQuery = getQueryType(parameter) !== "none";
  return parameter.hasVariableTemplateTagTarget && !canQuery;
}

function isFieldWidget(parameter) {
  const canQuery = getQueryType(parameter) !== "none";

  return parameter.hasVariableTemplateTagTarget
    ? canQuery
    : canQuery || hasFields(parameter);
}
