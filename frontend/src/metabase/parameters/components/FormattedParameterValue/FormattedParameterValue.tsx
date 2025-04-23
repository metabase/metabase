import { Ellipsified } from "metabase/core/components/Ellipsified";
import { ParameterFieldWidgetValue } from "metabase/parameters/components/widgets/ParameterFieldWidget/ParameterFieldWidgetValue/ParameterFieldWidgetValue";
import { formatParameterValue } from "metabase/parameters/utils/formatting";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  getFields,
  hasFields,
  isFieldFilterUiParameter,
} from "metabase-lib/v1/parameters/utils/parameter-fields";
import {
  isDateParameter,
  isStringParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import { parameterHasNoDisplayValue } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterValue, RowValue } from "metabase-types/api";

export type FormattedParameterValueProps = {
  parameter: UiParameter;
  value: string | number | number[];
  placeholder?: string;
  isPopoverOpen?: boolean;
};

function FormattedParameterValue({
  parameter,
  value,
  placeholder,
  isPopoverOpen = false,
}: FormattedParameterValueProps) {
  if (parameterHasNoDisplayValue(value)) {
    return placeholder;
  }

  const first = getValue(value);
  const values = parameter?.values_source_config?.values;
  const displayValue = values?.find(
    (value) => getValue(value)?.toString() === first?.toString(),
  );

  const label = getLabel(displayValue);

  const renderContent = () => {
    if (
      isFieldFilterUiParameter(parameter) &&
      hasFields(parameter) &&
      !isDateParameter(parameter)
    ) {
      return (
        <ParameterFieldWidgetValue
          fields={getFields(parameter)}
          value={value}
          displayValue={label}
        />
      );
    }

    if (label) {
      return <span>{formatParameterValue(label, parameter)}</span>;
    }

    return <span>{formatParameterValue(value, parameter)}</span>;
  };

  if (isStringParameter(parameter)) {
    const hasLongValue = typeof first === "string" && first.length > 80;
    return (
      <Ellipsified
        showTooltip={!isPopoverOpen}
        multiline
        tooltipMaxWidth={hasLongValue ? 450 : undefined}
      >
        {renderContent()}
      </Ellipsified>
    );
  }

  return renderContent();
}

function getValue(
  value: string | number | number[] | ParameterValue | undefined,
): RowValue | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value?.toString();
}

function getLabel(
  value: string | ParameterValue | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[1];
  }
  return value?.toString();
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormattedParameterValue;
