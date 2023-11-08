import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import CheckBox from "metabase/components/CheckBox";
import {
  SegmentedControl,
  optionShape,
} from "metabase/components/SegmentedControl";

import { AUTHORITY_LEVELS } from "../constants";
import { FormFieldRoot, Label } from "./FormCollectionAuthorityLevel.styled";

const propTypes = {
  field: PropTypes.shape({
    value: PropTypes.any,
    initialValue: PropTypes.any,
    onChange: PropTypes.func.isRequired,
  }).isRequired,
  options: PropTypes.arrayOf(optionShape).isRequired,
  values: PropTypes.shape({
    id: PropTypes.number,
    authority_level: PropTypes.oneOf(["official"]),
    update_collection_tree_authority_level: PropTypes.bool,
  }),
  onChangeField: PropTypes.func.isRequired,
};

export function FormCollectionAuthorityLevel({
  field,
  options,
  values,
  onChangeField,
}) {
  const isNewCollection = !values.id;
  const selectedAuthorityLevel =
    AUTHORITY_LEVELS[field.value] || AUTHORITY_LEVELS.regular;
  const shouldSuggestToUpdateChildren =
    !isNewCollection && field.initialValue !== field.value;
  return (
    <FormFieldRoot>
      <SegmentedControl
        value={field.value}
        onChange={field.onChange}
        options={options}
        variant="fill-background"
        inactiveColor="text-dark"
      />
      {shouldSuggestToUpdateChildren && (
        <CheckBox
          label={
            <Label>{t`Make all sub-collections ${selectedAuthorityLevel.name}, too.`}</Label>
          }
          checked={values.update_collection_tree_authority_level}
          onChange={e =>
            onChangeField(
              "update_collection_tree_authority_level",
              e.target.checked,
            )
          }
        />
      )}
    </FormFieldRoot>
  );
}

FormCollectionAuthorityLevel.propTypes = propTypes;
