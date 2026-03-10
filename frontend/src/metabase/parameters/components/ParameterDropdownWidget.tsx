import { t } from "ttag";

import type { ParameterValueWidgetProps } from "metabase/parameters/components/ParameterValueWidget";
import { getParameterWidgetTitle } from "metabase/parameters/utils/ui";
import { BooleanWidget } from "metabase/querying/parameters/components/BooleanWidget";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import { DateMonthYearWidget } from "metabase/querying/parameters/components/DateMonthYearWidget";
import { DateQuarterYearWidget } from "metabase/querying/parameters/components/DateQuarterYearWidget";
import { DateRangeWidget } from "metabase/querying/parameters/components/DateRangeWidget";
import { DateRelativeWidget } from "metabase/querying/parameters/components/DateRelativeWidget";
import { DateSingleWidget } from "metabase/querying/parameters/components/DateSingleWidget";
import type {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/v1/parameters/types";
import { getNumberParameterArity } from "metabase-lib/v1/parameters/utils/operators";
import { hasFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { getQueryType } from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  isBooleanParameter,
  isDateParameter,
  isNumberParameter,
  isTemporalUnitParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import { getIsMultiSelect } from "metabase-lib/v1/parameters/utils/parameter-values";

import { NumberInputWidget } from "./widgets/NumberInputWidget";
import { ParameterFieldWidget } from "./widgets/ParameterFieldWidget/ParameterFieldWidget";
import { StringInputWidget } from "./widgets/StringInputWidget";
import { TemporalUnitWidget } from "./widgets/TemporalUnitWidget";
import { TextWidget } from "./widgets/TextWidget";

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
  cardId,
  dashboardId,
  enableRequiredBehavior,
}: ParameterDropdownWidgetProps) => {
  const normalizedValue = Array.isArray(value)
    ? value
    : [value].filter((v) => v != null);

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
      "date/quarter-year": DateQuarterYearWidget,
      "date/relative": DateRelativeWidget,
      "date/all-options": DateAllOptionsWidget,
    }[parameter.type];

    if (DateWidget) {
      return (
        <DateWidget
          value={value}
          availableOperators={["=", ">", "<", "between", "!="]}
          submitButtonLabel={value ? t`Update filter` : t`Add filter`}
          onChange={(value) => {
            setValue?.(value);
            onPopoverClose?.();
          }}
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

  if (isBooleanParameter(parameter)) {
    return (
      <BooleanWidget
        value={value}
        submitButtonLabel={value ? t`Update filter` : t`Add filter`}
        onChange={(value) => {
          setValue?.(value);
          onPopoverClose?.();
        }}
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
        cardId={cardId}
        dashboardId={dashboardId}
        value={normalizedValue}
        fields={parameter.fields}
        setValue={setValueOrDefault}
        isEditing={isEditing}
      />
    );
  }

  return (
    <StringInputWidget
      className={className}
      parameter={parameter}
      value={normalizedValue}
      setValue={setValueOrDefault}
      label={getParameterWidgetTitle(parameter)}
      placeholder={isEditing ? t`Enter a default value…` : undefined}
      autoFocus
      isMultiSelect={getIsMultiSelect(parameter)}
    />
  );
};

export function isTextWidget(parameter: UiParameter) {
  const canQuery = getQueryType(parameter) !== "none";
  const isMultiSelect = getIsMultiSelect(parameter);
  return parameter.hasVariableTemplateTagTarget && !canQuery && !isMultiSelect;
}

function isFieldWidget(
  parameter: UiParameter,
): parameter is FieldFilterUiParameter {
  const canQuery = getQueryType(parameter) !== "none";

  return parameter.hasVariableTemplateTagTarget
    ? canQuery
    : canQuery || hasFields(parameter);
}
