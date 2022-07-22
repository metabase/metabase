import React from "react";
import PropTypes from "prop-types";
import {
  optionShape,
  SegmentedControl,
} from "metabase/components/SegmentedControl";
import { FormFieldRoot } from "./FormCollectionAuthorityLevel.styled";

const propTypes = {
  field: PropTypes.shape({
    value: PropTypes.any,
    initialValue: PropTypes.any,
    onChange: PropTypes.func.isRequired,
  }).isRequired,
  options: PropTypes.arrayOf(optionShape).isRequired,
};

export function FormCollectionAuthorityLevel({ field, options }) {
  return (
    <FormFieldRoot>
      <SegmentedControl
        value={field.value}
        onChange={field.onChange}
        options={options}
        variant="fill-background"
        inactiveColor="text-dark"
      />
    </FormFieldRoot>
  );
}

FormCollectionAuthorityLevel.propTypes = propTypes;
