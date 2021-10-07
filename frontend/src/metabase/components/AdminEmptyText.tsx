import React from "react";
import PropTypes from "prop-types";

const AdminEmptyText: React.FC<PropTypes.InferProps<typeof propTypes>> = ({ message }) => (
  <h2 className="text-medium">{message}</h2>
);

const propTypes = {
  message: PropTypes.string.isRequired,
};

AdminEmptyText.propTypes = propTypes;

export default AdminEmptyText;
