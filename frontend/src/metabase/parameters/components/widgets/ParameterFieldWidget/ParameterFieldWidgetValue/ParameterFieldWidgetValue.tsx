import React from "react";
import PropTypes from "prop-types";

import { renderNumberOfSelections } from "metabase/parameters/utils/formatting";
import Value from "metabase/components/Value";
import Field from "metabase-lib/lib/metadata/Field";

import { normalizeValue } from "../normalizeValue";

type ParameterFieldWidgetValueProps = {
  value: unknown;
  fields: Field[];
};

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
