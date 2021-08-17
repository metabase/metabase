import React from "react";
import PropTypes from "prop-types";

const propTypes = {
  children: PropTypes.node,
};

const NotificationSettings = ({ children }) => {
  return <div>{children}</div>;
};

NotificationSettings.propTypes = propTypes;

export default NotificationSettings;
