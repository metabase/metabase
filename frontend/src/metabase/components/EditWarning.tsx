import React from "react";
import PropTypes from "prop-types";

type Props = PropTypes.InferProps<typeof propTypes>;

const EditWarning: React.FC<Props> = ({ title }) => {
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

const propTypes = {
  title: PropTypes.string.isRequired,
};

EditWarning.propTypes = propTypes;

export default EditWarning;
