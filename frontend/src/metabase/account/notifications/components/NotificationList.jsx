import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import NotificationItem from "./NotificationItem";
import {
  NotificationButton,
  NotificationHeader,
  NotificationIcon,
  NotificationLabel,
  NotificationMessage,
  NotificationSection,
} from "./NotificationList.styled";

const propTypes = {
  groups: PropTypes.array.isRequired,
  user: PropTypes.object,
  children: PropTypes.node,
  onHelp: PropTypes.func,
};

const NotificationList = ({ groups, user, children, onHelp }) => {
  if (!groups.length) {
    return <NotificationEmptyState />;
  }

  return (
    <div>
      <NotificationHeader>
        <NotificationLabel>{t`You receive or created these`}</NotificationLabel>
        <NotificationButton
          onClick={onHelp}
        >{t`Not seeing one here?`}</NotificationButton>
      </NotificationHeader>
      {groups.map(({ item, type }) => (
        <NotificationItem key={item.id} item={item} type={type} user={user} />
      ))}
      {children}
    </div>
  );
};

const NotificationEmptyState = () => {
  return (
    <NotificationSection>
      <NotificationIcon name="bell" />
      <NotificationMessage>
        {t`If you subscribe  or are added to dashboard subscriptions or alerts you’ll be able to manage those here.`}
      </NotificationMessage>
    </NotificationSection>
  );
};

NotificationList.propTypes = propTypes;

export default NotificationList;
