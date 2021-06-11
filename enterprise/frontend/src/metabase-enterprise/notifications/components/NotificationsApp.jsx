import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";
import styled from "styled-components";
import { Link } from "react-router";

import Questions from "metabase/entities/questions";
import User from "metabase/entities/users";
import { color } from "metabase/lib/colors";
import { getRelativeTime } from "metabase/lib/time";
import { useAsyncFunction } from "metabase/lib/hooks";
import * as Urls from "metabase/lib/urls";
import { getModerationStatusIcon } from "metabase-enterprise/moderation";

import NotificationSectionHeader from "./NotificationSectionHeader";
import { NotificationsApi, ModerationRequestApi } from "metabase/services";
import Icon from "metabase/components/Icon";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
`;

const List = styled.div`
  background-color: white;
  border-radius: 8px;
  border: 1px solid ${color("border")};
  max-width: 800px;
  width: 100%;
`;

const ListItem = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${color("border")};
  display: flex;
  flex-direction: column;
  row-gap: 0.5rem;
`;

const ItemLink = styled(Link)`
  font-size: 16px;
  font-weight: bold;
  color: ${color("brand")};

  &:hover {
    text-decoration: underline;
  }
`;

const TitleIcon = styled(Icon).attrs({
  size: 16,
})`
  margin-right: 0.33rem;
`;

const ItemIcon = TitleIcon.extend`
  color: ${color("brand")};
`;

const ItemHeader = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  font-weight: bold;
`;

const RelativeTime = styled.time`
  color: ${color("text-light")};
`;

NotificationsApp.propTypes = {
  questions: PropTypes.array,
  users: PropTypes.array,
  router: PropTypes.object.isRequired,
};

function NotificationsApp({ questions, users, router }) {
  const [notifications, setNotifications] = useState(undefined);
  const [moderationRequests, setModerationRequests] = useState(undefined);
  const [fetchModerationRequests] = useAsyncFunction(ModerationRequestApi.get);
  const [fetchNotifications] = useAsyncFunction(NotificationsApi.get);

  const usersById = _.indexBy(users, "id");
  const moderationRequestsById = _.indexBy(moderationRequests, "id");
  const questionsById = _.indexBy(questions, "id");

  useEffect(() => {
    fetchNotifications().then(notifications => {
      setNotifications(notifications);
    });

    fetchModerationRequests().then(moderationRequests => {
      setModerationRequests(moderationRequests);
    });
  }, [fetchNotifications, fetchModerationRequests]);
  // not accounting for loading / rejected states yet
  const allRelevantDataLoaded = !!(
    notifications &&
    moderationRequests &&
    questions
  );

  const notificationsWithMetadata = allRelevantDataLoaded
    ? notifications.map(notification => {
        const { id, notifier, notifier_type } = notification;

        if (notifier_type === "comment") {
          const { author_id, text, created_at, commented_item_id } = notifier;
          const author = usersById[author_id];
          const authorDisplayName = author ? author.common_name : t`Someone`;
          const moderationRequest =
            moderationRequestsById[commented_item_id] || {};

          // todo -- also need to account for other moderated_item_types
          const item = questionsById[moderationRequest.moderated_item_id];
          const itemName = item && item.name;

          return {
            notification,
            notificationId: id,
            title: buildCommentTitle(authorDisplayName, item.type), // todo -- move to mod/index.js
            titleIcon: "speech_bubble", // todo -- currently scaling this icon
            itemName,
            itemLink: Urls.question(item), // todo -- not always question
            itemIcon: "number", // mocks seem to have different icons for different types of questions
            text,
            timestamp: new Date(created_at).valueOf(), // todo -- timestamp fn getTimestamp() similar to below
            relativeTimestamp: getRelativeTime(created_at),
          };
        } else if (notifier_type === "moderation_review") {
          const {
            moderator_id,
            moderated_item,
            text,
            status,
            created_at,
          } = notifier;
          const { name: itemName } = moderated_item;

          const moderator = usersById[moderator_id];
          const moderatorDisplayName = moderator // todo -- make a lib/user function for this
            ? moderator.common_name
            : t`Someone`;
          const { icon: titleIcon } = getModerationStatusIcon(status);

          return {
            notification,
            notificationId: id,
            title: buildReviewTitle(moderatorDisplayName, status), // todo -- move
            titleIcon,
            itemName,
            itemLink: Urls.question(moderated_item), // todo -- not always question
            itemIcon: "number", // mocks seem to have different icons for different types of questions
            text,
            timestamp: new Date(created_at).valueOf(), // todo -- above
            relativeTimestamp: getRelativeTime(created_at),
          };
        }
      })
    : [];

  return (
    <div>
      <NotificationSectionHeader />
      <Container>
        {notificationsWithMetadata.length > 0 && (
          <List>
            {notificationsWithMetadata.map(
              (
                {
                  notificationId,
                  title,
                  titleIcon,
                  itemName,
                  itemIcon,
                  itemLink,
                  text,
                  timestamp,
                  relativeTimestamp,
                },
                i,
              ) => {
                return (
                  <ListItem key={notificationId}>
                    <ItemHeader>
                      <span>
                        <TitleIcon name={titleIcon} />
                        {title}
                      </span>
                      <RelativeTime dateTime={timestamp}>
                        {relativeTimestamp}
                      </RelativeTime>
                    </ItemHeader>
                    <ItemLink to={itemLink}>
                      <ItemIcon name={itemIcon} />
                      {itemName}
                    </ItemLink>
                    <div>{text}</div>
                  </ListItem>
                );
              },
            )}
          </List>
        )}
        {notificationsWithMetadata.length === 0 && (
          <div>{t`No notifications`}</div>
        )}
      </Container>
    </div>
  );
}

export default _.compose(
  User.loadList(),
  Questions.loadList(),
)(NotificationsApp);

function buildReviewTitle(name, status) {
  switch (status) {
    case "verified":
      return t`${name} verified a question.`;
    case "misleading":
      return t`${name} flagged a question as misleading.`;
    case "confusing":
      return t`${name} flagged a question as confusing.`;
    case "pending":
      return t`${name} removed a question's status.`;
    default:
      return t`${name} marked a question as ${status}.`;
  }
}

function buildCommentTitle(name, requestType) {
  switch (requestType) {
    case "verification_request":
      return t`${name} commented on your verification request.`;
    case "something_wrong":
    case "confused":
    default:
      return t`${name} commented on your request.`;
  }
}
