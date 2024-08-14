import cx from "classnames";
import PropTypes from "prop-types";
import { createRef, Component } from "react";
import { t } from "ttag";

import { DateAllOptionsWidget } from "metabase/components/DateAllOptionsWidget";
import { DateMonthYearWidget } from "metabase/components/DateMonthYearWidget";
import { DateQuarterYearWidget } from "metabase/components/DateQuarterYearWidget";
import { DateRangeWidget } from "metabase/components/DateRangeWidget";
import { DateRelativeWidget } from "metabase/components/DateRelativeWidget";
import { DateSingleWidget } from "metabase/components/DateSingleWidget";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { TextWidget } from "metabase/components/TextWidget";
import { Sortable } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import FormattedParameterValue from "metabase/parameters/components/FormattedParameterValue";
import { NumberInputWidget } from "metabase/parameters/components/widgets/NumberInputWidget";
import { StringInputWidget } from "metabase/parameters/components/widgets/StringInputWidget";
import {
  getParameterIconName,
  getParameterWidgetTitle,
} from "metabase/parameters/utils/ui";
import { Icon } from "metabase/ui";
import {
  getNumberParameterArity,
  getStringParameterArity,
} from "metabase-lib/v1/parameters/utils/operators";
import { hasFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { getQueryType } from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  isDateParameter,
  isNumberParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import {
  areParameterValuesIdentical,
  parameterHasNoDisplayValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";

import S from "./ParameterValueWidget.module.css";
import { ParameterValueWidgetTrigger } from "./ParameterValueWidgetTrigger";
import { WidgetStatus } from "./WidgetStatus";
import ParameterFieldWidget from "./widgets/ParameterFieldWidget/ParameterFieldWidget";

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
    question: PropTypes.object,
    setParameterValueToDefault: PropTypes.func,
    // This means the widget will take care of the default value.
    // Should be used for dashboards and native questions in the parameter bar,
    // Don't use in settings sidebars.
    enableRequiredBehavior: PropTypes.bool,
    mimicMantine: PropTypes.bool,
    isSortable: PropTypes.bool,
  };

  state = { isFocused: false };

  constructor(props) {
    super(props);

    this.valuePopover = createRef();
    this.trigger = createRef();
  }

  onFocusChanged = isFocused => {
    const { focusChanged: parentFocusChanged, enableRequiredBehavior } =
      this.props;
    if (parentFocusChanged) {
      parentFocusChanged(isFocused);
    }
    this.setState({ isFocused });

    if (enableRequiredBehavior && !isFocused) {
      this.resetToDefault();
    }
  };

  resetToDefault() {
    const { required, default: defaultValue } = this.props.parameter;
    const { value } = this.props;

    if (required && defaultValue != null && !value) {
      this.props.setValue(defaultValue);
    }
  }

  onPopoverClose = () => {
    if (this.valuePopover.current) {
      this.valuePopover.current.close();
    }
  };

  getTargetRef = () => {
    return this.trigger.current;
  };

  getActionIcon() {
    if (this.props.isFullscreen) {
      return null;
    }

    const icon =
      this.props.enableRequiredBehavior && this.props.parameter.required
        ? this.getRequiredActionIcon()
        : this.getOptionalActionIcon();

    if (!icon) {
      // This is required to keep input width constant
      return <WidgetStatus className={S.widgetStatus} status="none" />;
    }

    return icon;
  }

  getOptionalActionIcon() {
    const { parameter, value, setParameterValueToDefault, setValue } =
      this.props;
    const { isFocused } = this.state;
    const { default: defaultValue } = parameter;
    const hasValue = !parameterHasNoDisplayValue(value);
    const hasDefaultValue = !parameterHasNoDisplayValue(parameter.default);
    const fieldHasValueOrFocus = parameter.value != null || isFocused;

    if (
      hasDefaultValue &&
      !areParameterValuesIdentical(wrapArray(value), wrapArray(defaultValue))
    ) {
      return (
        <WidgetStatus
          className={S.widgetStatus}
          highlighted={fieldHasValueOrFocus}
          status="reset"
          onClick={() => setParameterValueToDefault?.(parameter.id)}
        />
      );
    }

    if (hasValue) {
      return (
        <WidgetStatus
          className={S.widgetStatus}
          highlighted={fieldHasValueOrFocus}
          status="clear"
          onClick={() => {
            setValue(null);
          }}
        />
      );
    }

    if (!hasNoPopover(parameter)) {
      return <WidgetStatus className={S.widgetStatus} status="empty" />;
    }
  }

  getRequiredActionIcon() {
    const { parameter, value, setParameterValueToDefault, setValue } =
      this.props;
    const { isFocused } = this.state;
    const { required, default: defaultValue } = parameter;
    const hasValue = !parameterHasNoDisplayValue(value);
    const hasDefaultValue = !parameterHasNoDisplayValue(parameter.default);
    const fieldHasValueOrFocus = parameter.value != null || isFocused;

    if (
      required &&
      hasDefaultValue &&
      !areParameterValuesIdentical(wrapArray(value), wrapArray(defaultValue))
    ) {
      return (
        <WidgetStatus
          className={S.widgetStatus}
          highlighted={fieldHasValueOrFocus}
          status="reset"
          onClick={() => setParameterValueToDefault?.(parameter.id)}
        />
      );
    }

    if (required && !hasDefaultValue && hasValue) {
      return (
        <WidgetStatus
          className={S.widgetStatus}
          highlighted={fieldHasValueOrFocus}
          status="clear"
          onClick={() => {
            setValue(null);
          }}
        />
      );
    }
  }

  wrapSortable(children) {
    const { isSortable = false, parameter } = this.props;

    return (
      <Sortable
        id={parameter.id}
        draggingStyle={{ opacity: 0.5 }}
        disabled={!isSortable}
        role="listitem"
      >
        {children}
      </Sortable>
    );
  }

  render() {
    const {
      parameter,
      value,
      isEditing,
      placeholder,
      className,
      mimicMantine,
    } = this.props;
    const { isFocused } = this.state;
    const hasValue = !parameterHasNoDisplayValue(value);
    const noPopover = hasNoPopover(parameter);
    const parameterTypeIcon = getParameterIconName(parameter);
    const showTypeIcon = !isEditing && !hasValue && !isFocused;

    if (noPopover) {
      return this.wrapSortable(
        <ParameterValueWidgetTrigger
          className={cx(S.noPopover, className)}
          ariaLabel={parameter.name}
          hasValue={hasValue}
        >
          {showTypeIcon && (
            <Icon
              name={parameterTypeIcon}
              className={cx(CS.mr1, CS.flexNoShrink)}
              size={16}
            />
          )}
          <Widget
            {...this.props}
            target={this.getTargetRef()}
            onFocusChanged={this.onFocusChanged}
            onPopoverClose={this.onPopoverClose}
          />
          {this.getActionIcon()}
        </ParameterValueWidgetTrigger>,
      );
    }

    const placeholderText = isEditing
      ? isDateParameter(parameter)
        ? t`Select a default value…`
        : t`Enter a default value…`
      : placeholder || t`Select…`;

    return (
      <PopoverWithTrigger
        ref={this.valuePopover}
        targetOffsetX={16}
        triggerElement={this.wrapSortable(
          <ParameterValueWidgetTrigger
            ref={this.trigger}
            hasValue={hasValue}
            className={className}
            ariaLabel={placeholder}
            mimicMantine={mimicMantine}
          >
            {showTypeIcon && (
              <Icon
                name={parameterTypeIcon}
                className={cx(CS.mr1, CS.flexNoShrink)}
                size={16}
              />
            )}
            <div className={cx(CS.mr1, CS.textNoWrap)}>
              <FormattedParameterValue
                parameter={parameter}
                value={value}
                placeholder={placeholderText}
              />
            </div>
            {this.getActionIcon()}
          </ParameterValueWidgetTrigger>,
        )}
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
  enableRequiredBehavior,
}) {
  const normalizedValue = Array.isArray(value)
    ? value
    : [value].filter(v => v != null);

  // TODO this is due to some widgets not supporting focusChanged callback.
  const setValueOrDefault = value => {
    const { required, default: defaultValue } = parameter;
    const shouldUseDefault =
      enableRequiredBehavior && required && defaultValue && !value?.length;

    setValue(shouldUseDefault ? defaultValue : value);
    onPopoverClose();
  };

  if (isDateParameter(parameter)) {
    const DateWidget = {
      "date/single": DateSingleWidget,
      "date/range": DateRangeWidget,
      "date/relative": DateRelativeWidget,
      "date/month-year": DateMonthYearWidget,
      "date/quarter-year": DateQuarterYearWidget,
      "date/all-options": DateAllOptionsWidget,
    }[parameter.type];

    return (
      <DateWidget
        value={value}
        initialValue={value}
        defaultValue={parameter.default}
        required={parameter.required}
        setValue={setValue}
        onClose={onPopoverClose}
      />
    );
  }

  if (isTextWidget(parameter)) {
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

  if (isNumberParameter(parameter)) {
    const arity = getNumberParameterArity(parameter);
    return (
      <NumberInputWidget
        value={normalizedValue}
        setValue={setValueOrDefault}
        arity={arity}
        infixText={typeof arity === "number" && arity > 1 ? t`and` : undefined}
        autoFocus
        placeholder={isEditing ? t`Enter a default value…` : undefined}
        label={getParameterWidgetTitle(parameter)}
        parameter={parameter}
      />
    );
  }

  if (isFieldWidget(parameter)) {
    return (
      <ParameterFieldWidget
        target={target}
        parameter={parameter}
        parameters={parameters}
        question={question}
        dashboard={dashboard}
        value={normalizedValue}
        fields={parameter.fields}
        setValue={setValueOrDefault}
        isEditing={isEditing}
      />
    );
  }
  return (
    <StringInputWidget
      value={normalizedValue}
      setValue={setValueOrDefault}
      className={className}
      autoFocus
      placeholder={isEditing ? t`Enter a default value…` : undefined}
      arity={getStringParameterArity(parameter)}
      label={getParameterWidgetTitle(parameter)}
      parameter={parameter}
    />
  );
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

function wrapArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}
