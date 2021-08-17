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
  items: PropTypes.array.isRequired,
  user: PropTypes.object.isRequired,
};

const NotificationList = ({ items, user }) => {
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

export default NotificationList;
