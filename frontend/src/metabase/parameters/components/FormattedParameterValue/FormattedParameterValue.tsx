import { useLoadParameterValuesQuery } from "metabase/api";
import ParameterFieldWidgetValue from "metabase/parameters/components/widgets/ParameterFieldWidget/ParameterFieldWidgetValue/ParameterFieldWidgetValue";
import { formatParameterValue } from "metabase/parameters/utils/formatting";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  getFields,
  hasFields,
  isFieldFilterUiParameter,
} from "metabase-lib/v1/parameters/utils/parameter-fields";
import { isDateParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import { parameterHasNoDisplayValue } from "metabase-lib/v1/parameters/utils/parameter-values";

type FormattedParameterValueProps = {
  parameter: UiParameter;
  value: string | number | number[];
  placeholder?: string;
};

function FormattedParameterValue({
  parameter,
  value,
  placeholder,
}: FormattedParameterValueProps) {
  const { data, isLoading } = useLoadParameterValuesQuery(
    { parameter },
    {
      skip:
        !parameter ||
        parameterHasNoDisplayValue(value) ||
        Boolean(parameter.values_source_config?.values) ||
        (Array.isArray(value) && value.length !== 1),
    },
  );

  if (isLoading) {
    return null;
  }

  if (parameterHasNoDisplayValue(value)) {
    return placeholder;
  }

  const first = Array.isArray(value) ? value[0] : value;
  const values = parameter?.values_source_config?.values ?? data?.values;
  const displayValue = values?.find(v => v[0] === first?.toString())?.[1];

  if (
    isFieldFilterUiParameter(parameter) &&
    hasFields(parameter) &&
    !isDateParameter(parameter)
  ) {
    return (
      <ParameterFieldWidgetValue
        fields={getFields(parameter)}
        value={value}
        displayValue={displayValue}
      />
    );
  }

  return <span>{formatParameterValue(value, parameter)}</span>;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormattedParameterValue;
