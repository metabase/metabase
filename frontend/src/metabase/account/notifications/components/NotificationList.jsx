import React from "react";
import PropTypes from "prop-types";
import NotificationItem from "./NotificationItem";
import { NotificationListRoot } from "./NotificationList.styled";

const propTypes = {
  items: PropTypes.array.isRequired,
  user: PropTypes.object.isRequired,
};

const NotificationList = ({ items, user }) => {
  return (
    <NotificationListRoot>
      {items.map(item => (
        <NotificationItem key={item.id} item={item} user={user} />
      ))}
    </NotificationListRoot>
  );
};

NotificationList.propTypes = propTypes;

export default NotificationList;
