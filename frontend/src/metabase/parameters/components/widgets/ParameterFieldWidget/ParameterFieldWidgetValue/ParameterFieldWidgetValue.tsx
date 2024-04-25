import PropTypes from "prop-types";

import Value from "metabase/components/Value";
import { renderNumberOfSelections } from "metabase/parameters/utils/formatting";
import type Field from "metabase-lib/v1/metadata/Field";

import { normalizeValue } from "../normalizeValue";

type ParameterFieldWidgetValueProps = {
  value: unknown;
  fields: Field[];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ParameterFieldWidgetValue({
  value,
  fields,
}: ParameterFieldWidgetValueProps) {
  const values = normalizeValue(value);

  const numberOfValues = values.length;

  // If there are multiple fields, turn off remapping since they might
  // be remapped to different fields.
  const shouldRemap = fields.length === 1;

  return numberOfValues > 1 ? (
    <>{renderNumberOfSelections(numberOfValues)}</>
  ) : (
    <Value remap={shouldRemap} value={values[0]} column={fields[0]} />
  );
}

ParameterFieldWidgetValue.propTypes = {
  value: PropTypes.array,
  fields: PropTypes.array,
};
