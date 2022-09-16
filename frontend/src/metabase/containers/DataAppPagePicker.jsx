import React from "react";
import PropTypes from "prop-types";

import ItemPicker from "./ItemPicker";

const DataAppPagePicker = ({ value, onChange, ...props }) => (
  <ItemPicker
    {...props}
    value={value === undefined ? undefined : { model: "page", id: value }}
    onChange={page => onChange(page ? page.id : undefined)}
    models={["page"]}
  />
);

DataAppPagePicker.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
};

export default DataAppPagePicker;
