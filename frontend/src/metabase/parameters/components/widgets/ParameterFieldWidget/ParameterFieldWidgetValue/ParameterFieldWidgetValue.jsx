import React from "react";
import PropTypes from "prop-types";
import { ngettext, msgid } from "ttag";

import Value from "metabase/components/Value";
import { normalizeValue } from "../normalizeValue";

function renderNumberOfSelections(numberOfSelections) {
  return ngettext(
    msgid`${numberOfSelections} selection`,
    `${numberOfSelections} selections`,
    numberOfSelections,
  );
}

export default function ParameterFieldWidgetValue({ savedValue, fields }) {
  const values = normalizeValue(savedValue);

  const numberOfValues = values.length;

  // If there are multiple fields, turn off remapping since they might
  // be remapped to different fields.
  const shouldRemap = fields.length === 1;

  return numberOfValues > 1 ? (
    renderNumberOfSelections(numberOfValues)
  ) : (
    <Value remap={shouldRemap} value={savedValue[0]} column={fields[0]} />
  );
}

ParameterFieldWidgetValue.propTypes = {
  savedValue: PropTypes.array,
  fields: PropTypes.array,
};
