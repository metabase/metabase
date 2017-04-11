import React from "react";
import PropTypes from "prop-types";

const AdminEmptyText = ({ message }) =>
    <h2 className="text-grey-3">{message}</h2>

AdminEmptyText.propTypes = {
    message: PropTypes.string.isRequired
}

export default AdminEmptyText;
