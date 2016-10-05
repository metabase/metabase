import React, { PropTypes } from "react";

const AdminEmptyText = ({ message }) =>
    <h2 className="text-grey-3">{message}</h2>

AdminEmptyText.propTypes = {
    message: PropTypes.string.isRequired
}

export default AdminEmptyText;
