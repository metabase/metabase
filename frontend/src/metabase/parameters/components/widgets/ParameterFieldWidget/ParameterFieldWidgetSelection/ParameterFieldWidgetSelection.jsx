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

export default function ParameterFieldWidgetSelection({ savedValue, fields }) {
  const values = normalizeValue(savedValue);

  const numberOfValues = values.length;

  return numberOfValues > 1 ? (
    renderNumberOfSelections(numberOfValues)
  ) : (
    <Value
      // If there are multiple fields, turn off remapping since they might
      // be remapped to different fields.
      remap={fields.length === 1}
      value={savedValue[0]}
      column={fields[0]}
    />
  );
}

ParameterFieldWidgetSelection.propTypes = {
  savedValue: PropTypes.array,
  fields: PropTypes.array,
};
