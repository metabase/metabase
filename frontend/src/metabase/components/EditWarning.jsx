import React from "react";
import PropTypes from "prop-types";

function EditWarning({ title }) {
  if (title) {
    return (
      <div className="EditHeader wrapper py1 flex align-center">
        <span className="EditHeader-title">{title}</span>
      </div>
    );
  } else {
    return null;
  }
}

EditWarning.propTypes = {
  title: PropTypes.string.isRequired,
};

export default EditWarning;
