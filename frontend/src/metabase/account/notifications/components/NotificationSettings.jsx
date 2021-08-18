import React from "react";
import PropTypes from "prop-types";
import NotificationList from "./NotificationList";

const propTypes = {
  user: PropTypes.object.isRequired,
  alerts: PropTypes.array,
  pulses: PropTypes.array,
};

const NotificationSettings = ({ user, alerts, pulses }) => {
  return <NotificationList user={user} alerts={alerts} pulses={pulses} />;
};

NotificationSettings.propTypes = propTypes;

export default NotificationSettings;
