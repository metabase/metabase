import React from "react";
import PropTypes from "prop-types";

import ItemPicker from "./ItemPicker";

const DashboardPicker = ({ value, onChange, ...props }) => (
  <ItemPicker
    {...props}
    value={value === undefined ? undefined : { model: "dashboard", id: value }}
    onChange={dashboard => onChange(dashboard ? dashboard.id : undefined)}
    models={["dashboard"]}
  />
);

DashboardPicker.propTypes = {
  // a dashboard ID or null
  value: PropTypes.number,
  // callback that takes a dashboard ID
  onChange: PropTypes.func.isRequired,
};

export default DashboardPicker;
