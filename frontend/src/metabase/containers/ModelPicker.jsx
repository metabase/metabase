import React from "react";
import PropTypes from "prop-types";

import ItemPicker from "./ItemPicker";

const ModelPicker = ({ value, onChange, ...props }) => (
  <ItemPicker
    {...props}
    value={value === undefined ? undefined : { model: "page", id: value }}
    onChange={page => onChange(page ? page.id : undefined)}
    models={["dataset"]}
  />
);

ModelPicker.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
};

export default ModelPicker;
