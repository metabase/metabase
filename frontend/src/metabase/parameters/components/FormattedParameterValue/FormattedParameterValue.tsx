import { formatParameterValue } from "metabase/parameters/utils/formatting";
import ParameterFieldWidgetValue from "metabase/parameters/components/widgets/ParameterFieldWidget/ParameterFieldWidgetValue/ParameterFieldWidgetValue";
import type { UiParameter } from "metabase-lib/parameters/types";
import {
  getFields,
  hasFields,
  isFieldFilterUiParameter,
} from "metabase-lib/parameters/utils/parameter-fields";
import { isDateParameter } from "metabase-lib/parameters/utils/parameter-type";

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
  if (value == null) {
    return placeholder;
  }

  if (
    isFieldFilterUiParameter(parameter) &&
    hasFields(parameter) &&
    !isDateParameter(parameter)
  ) {
    return (
      <ParameterFieldWidgetValue fields={getFields(parameter)} value={value} />
    );
  }

  return <span>{formatParameterValue(value, parameter)}</span>;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormattedParameterValue;
