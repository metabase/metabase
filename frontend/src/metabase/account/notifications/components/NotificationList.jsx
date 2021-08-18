import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import NotificationItem from "./NotificationItem";
import {
  NotificationButton,
  NotificationHeader,
  NotificationLabel,
} from "./NotificationList.styled";

const propTypes = {
  alerts: PropTypes.array.isRequired,
  pulses: PropTypes.array.isRequired,
  user: PropTypes.object,
};

const NotificationList = ({ user, alerts, pulses }) => {
  const items = formatItems(alerts, pulses);

  return (
    <div>
      <NotificationHeader>
        <NotificationLabel>{t`You receive or created these`}</NotificationLabel>
        <NotificationButton>{t`Not seeing one here?`}</NotificationButton>
      </NotificationHeader>
      {items.map(item => (
        <NotificationItem key={item.id} item={item} user={user} />
      ))}
    </div>
  );
};

NotificationList.propTypes = propTypes;

const formatItems = (alerts, pulses) => {
  return [...alerts, ...pulses].sort((a, b) => b.created_at - a.created_at);
};

export default NotificationList;
