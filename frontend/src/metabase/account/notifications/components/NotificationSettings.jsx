import React from "react";
import PropTypes from "prop-types";
import NotificationList from "./NotificationList";

const propTypes = {
  pulses: PropTypes.array.isRequired,
  user: PropTypes.object.isRequired,
};

const NotificationSettings = ({ pulses, user }) => {
  return <NotificationList items={pulses} user={user} />;
};

NotificationSettings.propTypes = propTypes;

export default NotificationSettings;
