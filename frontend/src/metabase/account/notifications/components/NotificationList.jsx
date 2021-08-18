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
  groups: PropTypes.array.isRequired,
  user: PropTypes.object,
};

const NotificationList = ({ groups, user }) => {
  return (
    <div>
      <NotificationHeader>
        <NotificationLabel>{t`You receive or created these`}</NotificationLabel>
        <NotificationButton>{t`Not seeing one here?`}</NotificationButton>
      </NotificationHeader>
      {groups.map(({ item, type }) => (
        <NotificationItem key={item.id} item={item} type={type} user={user} />
      ))}
    </div>
  );
};

NotificationList.propTypes = propTypes;

export default NotificationList;
