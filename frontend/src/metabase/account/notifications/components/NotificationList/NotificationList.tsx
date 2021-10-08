import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import NotificationCard from "../NotificationCard";
import {
  NotificationButton,
  NotificationHeader,
  NotificationIcon,
  NotificationLabel,
  NotificationMessage,
  NotificationSection,
} from "./NotificationList.styled";

const propTypes = {
  items: PropTypes.array.isRequired,
  user: PropTypes.object.isRequired,
  children: PropTypes.node,
  onHelp: PropTypes.func.isRequired,
  onUnsubscribe: PropTypes.func.isRequired,
  onArchive: PropTypes.func.isRequired,
};

type Props = PropTypes.InferProps<typeof propTypes>;

const NotificationList: React.FC<Props> = ({
  items,
  user,
  children,
  onHelp,
  onUnsubscribe,
  onArchive,
}) => {
  if (!items.length) {
    return <NotificationEmptyState />;
  }

  return (
    <div>
      <NotificationHeader>
        <NotificationLabel>{t`You receive or created these`}</NotificationLabel>
        <NotificationButton onClick={onHelp}>
          {t`Not seeing one here?`}
        </NotificationButton>
      </NotificationHeader>
      {items.map(({ item, type }) => (
        <NotificationCard
          key={`${type}-${item.id}`}
          item={item}
          type={type}
          user={user}
          onUnsubscribe={onUnsubscribe}
          onArchive={onArchive}
        />
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
        {t`If you subscribe or are added to dashboard subscriptions or alerts you’ll be able to manage those here.`}
      </NotificationMessage>
    </NotificationSection>
  );
};

NotificationList.propTypes = propTypes;

export default NotificationList;
