import { renderNumberOfSelections } from "metabase/parameters/utils/formatting";
import type Field from "metabase-lib/v1/metadata/Field";
import { canRemapValues } from "metabase-lib/v1/parameters/utils/parameter-fields";

import Value from "../Value";
import { normalizeValue } from "../normalizeValue";

type ParameterFieldWidgetValueProps = {
  value: unknown;
  fields: Field[];
  displayValue?: string;
};

export function ParameterFieldWidgetValue({
  value,
  fields,
  displayValue,
}: ParameterFieldWidgetValueProps) {
  const values = normalizeValue(value);

  const numberOfValues = values.length;

  return numberOfValues > 1 ? (
    <>{renderNumberOfSelections(numberOfValues)}</>
  ) : (
    <Value
      remap={canRemapValues(fields)}
      value={values[0]}
      column={fields[0]}
      displayValue={displayValue}
    />
  );
}
