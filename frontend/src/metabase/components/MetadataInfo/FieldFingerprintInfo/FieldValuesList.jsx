import React, { useEffect } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import Fields from "metabase/entities/fields";
import Field from "metabase-lib/lib/metadata/Field";

import { NoWrap } from "./FieldValuesList.styled";

const mapStateToProps = (state, props) => ({
  fieldValues: Fields.selectors.getFieldValues(state, {
    entityId: props.field.id,
  }),
});

const mapDispatchToProps = {
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

const propTypes = {
  field: PropTypes.instanceOf(Field).isRequired,
  fieldValues: PropTypes.array,
  fetchFieldValues: PropTypes.func.isRequired,
};

export function FieldValuesList({ field, fieldValues = [], fetchFieldValues }) {
  useEffect(() => {
    if (fieldValues.length === 0 && field.has_field_values === "list") {
      fetchFieldValues({ id: field.id });
    }
  }, [fetchFieldValues, field, fieldValues]);

  const shortenedValuesStr = fieldValues.slice(0, 35).join(", ");

  return fieldValues.length ? <NoWrap>{shortenedValuesStr}</NoWrap> : null;
}

FieldValuesList.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(FieldValuesList);
