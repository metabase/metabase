import React from "react";
import PropTypes from "prop-types";
import NotificationList from "./NotificationList";

const propTypes = {
  alerts: PropTypes.array,
  pulses: PropTypes.array,
  user: PropTypes.object,
};

const NotificationSettings = ({ alerts, pulses, user }) => {
  return <NotificationList alerts={alerts} pulses={pulses} user={user} />;
};

NotificationSettings.propTypes = propTypes;

export default NotificationSettings;
