/* eslint "react/prop-types": "warn" */

import React from "react";
import PropTypes from "prop-types";

import cx from "classnames";

// NOTE: currently relies on .QueryError CSS selectors residing in query_builder.css

type Props = PropTypes.InferProps<typeof propTypes>;

const ErrorMessage: React.FC<Props> = ({ title, type, message, action, className }) => {
  return (
    <div className={cx(className, "QueryError flex align-center")}>
      <div className={`QueryError-image QueryError-image--${type}`} />
      <div className="QueryError-message text-centered">
        {title && <h1 className="text-bold">{title}</h1>}
        <p className="QueryError-messageText">{message}</p>
        {action}
      </div>
    </div>
  );
};

const propTypes = {
  title: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  action: PropTypes.node,
  className: PropTypes.string,
};

ErrorMessage.propTypes = propTypes;

export default ErrorMessage;
