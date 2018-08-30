import React from "react";
import PropTypes from "prop-types";

import ItemPicker from "./ItemPicker";

const CollectionPicker = ({ value, onChange, ...props }) => (
  <ItemPicker
    {...props}
    value={value === undefined ? undefined : { model: "collection", id: value }}
    onChange={collection => onChange(collection ? collection.id : undefined)}
    models={["collection"]}
  />
);

CollectionPicker.propTypes = {
  // a collection ID or null (for "root" collection), or undefined if none selected
  value: PropTypes.number,
  // callback that takes a collection ID or null (for "root" collection)
  onChange: PropTypes.func.isRequired,
};

export default CollectionPicker;
