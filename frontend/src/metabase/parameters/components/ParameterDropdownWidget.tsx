import { t } from "ttag";

import { DateQuarterYearWidget } from "metabase/components/DateQuarterYearWidget";
import { DateRelativeWidget } from "metabase/components/DateRelativeWidget";
import { TextWidget } from "metabase/components/TextWidget";
import type { ParameterValueWidgetProps } from "metabase/parameters/components/ParameterValueWidget";
import { NumberInputWidget } from "metabase/parameters/components/widgets/NumberInputWidget";
import { StringInputWidget } from "metabase/parameters/components/widgets/StringInputWidget";
import { getParameterWidgetTitle } from "metabase/parameters/utils/ui";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import { DateMonthYearWidget } from "metabase/querying/parameters/components/DateMonthYearWidget";
import { DateRangeWidget } from "metabase/querying/parameters/components/DateRangeWidget";
import { DateSingleWidget } from "metabase/querying/parameters/components/DateSingleWidget";
import type {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/v1/parameters/types";
import {
  getNumberParameterArity,
  getStringParameterArity,
} from "metabase-lib/v1/parameters/utils/operators";
import { hasFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { getQueryType } from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  isDateParameter,
  isNumberParameter,
  isTemporalUnitParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";

import ParameterFieldWidget from "./widgets/ParameterFieldWidget/ParameterFieldWidget";
import { TemporalUnitWidget } from "./widgets/TemporalUnitWidget";

type ParameterDropdownWidgetProps = {
  onFocusChanged: (focused: boolean) => void;
  onPopoverClose?: () => void;
} & ParameterValueWidgetProps;

export const ParameterDropdownWidget = ({
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
  enableRequiredBehavior,
}: ParameterDropdownWidgetProps) => {
  const normalizedValue = Array.isArray(value)
    ? value
    : [value].filter(v => v != null);

  // TODO this is due to some widgets not supporting focusChanged callback.
  const setValueOrDefault = (value: any) => {
    const { required, default: defaultValue } = parameter;
    const shouldUseDefault =
      enableRequiredBehavior && required && defaultValue && !value?.length;

    setValue(shouldUseDefault ? defaultValue : value);
    onPopoverClose?.();
  };

  if (isDateParameter(parameter)) {
    const DateWidget = {
      "date/single": DateSingleWidget,
      "date/range": DateRangeWidget,
      "date/month-year": DateMonthYearWidget,
      "date/all-options": DateAllOptionsWidget,
    }[parameter.type];

    const LegacyDateWidget = {
      "date/relative": DateRelativeWidget,
      "date/quarter-year": DateQuarterYearWidget,
    }[parameter.type];

    if (DateWidget) {
      return (
        <DateWidget
          value={value}
          availableOperators={["=", ">", "<", "between", "!="]}
          submitButtonLabel={value ? t`Update filter` : t`Add filter`}
          onChange={value => {
            setValue?.(value);
            onPopoverClose?.();
          }}
        />
      );
    }

    if (LegacyDateWidget) {
      return (
        <LegacyDateWidget
          value={value}
          initialValue={value}
          defaultValue={parameter.default}
          required={parameter.required}
          setValue={setValue}
          onClose={() => onPopoverClose?.()}
        />
      );
    }

    return null;
  }

  if (isTemporalUnitParameter(parameter)) {
    return (
      <TemporalUnitWidget
        parameter={parameter}
        value={value}
        setValue={setValue}
        onClose={() => onPopoverClose?.()}
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

  if (isNumberParameter(parameter) && getQueryType(parameter) !== "list") {
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
};

function isTextWidget(parameter: UiParameter) {
  const canQuery = getQueryType(parameter) !== "none";
  return parameter.hasVariableTemplateTagTarget && !canQuery;
}

function isFieldWidget(
  parameter: UiParameter,
): parameter is FieldFilterUiParameter {
  const canQuery = getQueryType(parameter) !== "none";

  return parameter.hasVariableTemplateTagTarget
    ? canQuery
    : canQuery || hasFields(parameter);
}
