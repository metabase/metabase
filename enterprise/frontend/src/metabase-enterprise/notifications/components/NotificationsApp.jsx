import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";
import styled from "styled-components";
import { Link } from "react-router";

import Questions from "metabase/entities/questions";
import User from "metabase/entities/users";
import { color } from "metabase/lib/colors";

import NotificationSectionHeader from "./NotificationSectionHeader";
import { NotificationsApi } from "metabase/services";
import Card from "metabase/components/Card";
import Comment from "metabase/components/Comment";

export const ListContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  grid-gap: 1rem;
  padding: 2rem;
`;

const QuestionNameHeader = styled.span`
  font-size: 16px;
  font-weight: bold;
  margin-left: 0.5rem;
`;

const CardLink = styled(Link)`
  max-width: 800px;
  width: 100%;

  &:hover ${QuestionNameHeader} {
    color: ${color("brand")};
  }
`;

const HoverableCard = styled(Card)`
  padding: 1.5rem;
  transition: box-shadow 200ms;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  padding-bottom: 0.5rem;
`;

RequestNotifications.propTypes = {
  questions: PropTypes.array,
  users: PropTypes.array,
  router: PropTypes.object.isRequired,
};

function RequestNotifications({ questions, users, router }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    NotificationsApi.get().then(notifications => {
      setNotifications(notifications);
    });
  });

  const notificationsWithMetadata = notifications;

  // requests
  //   .filter(request => {
  //     // will need to account for dashboards soon
  //     const isCard = request.moderated_item_type === "card";
  //     const mapsToExistingCard = !!questionsById[request.moderated_item_id];
  //     return (
  //       isCard &&
  //       mapsToExistingCard &&
  //       includedStatuses.includes(request.status)
  //     );
  //   })
  //   .map(request => {
  //     const question = questionsById[request.moderated_item_id];
  //     const questionDisplayName = question.name;
  //     const user = usersById[request.requester_id];
  //     const userDisplayName = user ? user.common_name : t`Someone`;

  //     return {
  //       request,
  //       userDisplayName,
  //       questionDisplayName,
  //       url: buildModerationRequestPath(request, question),
  //     };
  //   });

  return (
    <div>
      <NotificationSectionHeader />
      <ListContainer>
        {notificationsWithMetadata.map((notification, i) => {
          return <Card key={i}>{JSON.stringify(notification)}</Card>;

          // return (
          //   <CardLink key={request.id} className="" to={url}>
          //     <HoverableCard hoverable>
          //       <CardHeader>
          //         <QuestionNameHeader>
          //           {questionDisplayName}
          //         </QuestionNameHeader>
          //       </CardHeader>
          //       <Comment
          //         title={userDisplayName}
          //         text={request.text}
          //         timestamp={request.created_at}
          //       />
          //     </HoverableCard>
          //   </CardLink>
          // );
        })}
        {notificationsWithMetadata.length === 0 && (
          <div>{t`No notifications`}</div>
        )}
      </ListContainer>
    </div>
  );
}

export default _.compose(
  User.loadList(),
  Questions.loadList(),
)(RequestNotifications);
