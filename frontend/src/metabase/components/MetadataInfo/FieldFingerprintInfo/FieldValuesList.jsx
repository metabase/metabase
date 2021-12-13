import React from "react";
import PropTypes from "prop-types";

import Field from "metabase-lib/lib/metadata/Field";

import { NoWrap } from "./FieldValuesList.styled";

const propTypes = {
  field: PropTypes.instanceOf(Field).isRequired,
  fieldValues: PropTypes.array,
};

const FIELD_VALUES_SHOW_LIMIT = 35;

function FieldValuesList({ field, fieldValues = [] }) {
  const shortenedValuesStr = fieldValues
    .slice(0, FIELD_VALUES_SHOW_LIMIT)
    .join(", ");

  return fieldValues.length ? <NoWrap>{shortenedValuesStr}</NoWrap> : null;
}

FieldValuesList.propTypes = propTypes;

export default FieldValuesList;
