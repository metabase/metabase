import React, { useEffect } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { useAsyncFunction } from "metabase/hooks/use-async-function";
import Field from "metabase-lib/lib/metadata/Field";
import Fields from "metabase/entities/fields";

import { NoWrap } from "./FieldValuesList.styled";

const propTypes = {
  field: PropTypes.instanceOf(Field).isRequired,
  fieldValues: PropTypes.array.isRequired,
  fetchFieldValues: PropTypes.func.isRequired,
};

const FIELD_VALUES_SHOW_LIMIT = 35;

const mapStateToProps = (state, props) => {
  const fieldId = props.field.id;
  const fieldValues =
    fieldId != null
      ? Fields.selectors.getFieldValues(state, {
          entityId: fieldId,
        })
      : [];
  return {
    fieldValues: fieldValues || [],
  };
};

const mapDispatchToProps = {
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

function shouldListValues(field) {
  const isCategoryField = field.isCategory();
  const listsFieldValues = field.has_field_values === "list";

  return isCategoryField && listsFieldValues;
}

export function FieldValuesList({ field, fieldValues = [], fetchFieldValues }) {
  const safeFetchFieldValues = useAsyncFunction(fetchFieldValues);
  const fieldId = field.id;
  const isMissingFieldValues = fieldValues.length === 0;
  const listsFieldValues = shouldListValues(field);

  useEffect(() => {
    if (listsFieldValues && isMissingFieldValues) {
      safeFetchFieldValues({ id: fieldId });
    }
  }, [fieldId, listsFieldValues, isMissingFieldValues, safeFetchFieldValues]);

  const shortenedValuesStr = fieldValues
    .slice(0, FIELD_VALUES_SHOW_LIMIT)
    .join(", ");

  return listsFieldValues && !isMissingFieldValues ? (
    <NoWrap>{shortenedValuesStr}</NoWrap>
  ) : null;
}

FieldValuesList.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(FieldValuesList);
