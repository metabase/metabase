import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import NotificationItem from "./NotificationItem";
import {
  NotificationHeader,
  NotificationLabel,
  NotificationListRoot,
} from "./NotificationList.styled";

const propTypes = {
  items: PropTypes.array.isRequired,
  user: PropTypes.object.isRequired,
};

const NotificationList = ({ items, user }) => {
  return (
    <NotificationListRoot>
      <NotificationHeader>
        <NotificationLabel>{t`You receive or created these`}</NotificationLabel>
      </NotificationHeader>
      {items.map(item => (
        <NotificationItem key={item.id} item={item} user={user} />
      ))}
    </NotificationListRoot>
  );
};

NotificationList.propTypes = propTypes;

export default NotificationList;
