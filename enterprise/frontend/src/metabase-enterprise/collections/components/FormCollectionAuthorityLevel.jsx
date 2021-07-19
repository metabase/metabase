import React from "react";
import PropTypes from "prop-types";

import {
  SegmentedControl,
  optionShape,
} from "metabase/components/SegmentedControl";

const propTypes = {
  field: PropTypes.shape({
    value: PropTypes.any,
    onChange: PropTypes.func.isRequired,
  }).isRequired,
  options: PropTypes.arrayOf(optionShape).isRequired,
  values: PropTypes.shape({
    authority_level: PropTypes.oneOf(["official"]),
    update_collection_tree_authority_level: PropTypes.bool,
  }),
  onChangeField: PropTypes.func.isRequired,
};

export function FormCollectionAuthorityLevel({ field, options }) {
  return (
    <SegmentedControl
      value={field.value}
      onChange={field.onChange}
      options={options}
    />
  );
}

FormCollectionAuthorityLevel.propTypes = propTypes;
