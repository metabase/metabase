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
  canManageSubscriptions: PropTypes.bool,
  onHelp: PropTypes.func,
  onUnsubscribe: PropTypes.func,
  onArchive: PropTypes.func,
};

const NotificationList = ({
  items,
  user,
  children,
  canManageSubscriptions,
  onHelp,
  onUnsubscribe,
  onArchive,
}) => {
  if (!items.length) {
    return <NotificationEmptyState />;
  }

  return (
    <div data-testid="notifications-list">
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
          isEditable={canManageSubscriptions}
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
