import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";

import Questions from "metabase/entities/questions";
import User from "metabase/entities/users";
import { getMetadata } from "metabase/selectors/metadata";
import { createSelector } from "reselect";

import Question from "metabase-lib/lib/Question";

import NotificationSectionHeader from "./NotificationSectionHeader";
import RequestNotificationCard from "./RequestNotificationCard";
import { ListContainer } from "./RequestNotificationsApp.styled";

RequestNotifications.propTypes = {
  questions: PropTypes.array,
  users: PropTypes.array,
};

function RequestNotifications({ questions, users }) {
  const status = "open";
  const usersById = _.indexBy(users, "id");
  const requestsWithMetadata = questions
    .map(question => {
      const requests = question.getModerationRequests();
      const questionDisplayName = question.displayName();
      return requests
        .filter(request => request.status === status)
        .map(request => {
          const user = usersById[request.requester_id];
          const userDisplayName = user ? user.common_name : t`Someone`;

          return {
            request,
            userDisplayName,
            questionDisplayName,
          };
        });
    })
    .flat();

  console.log(questions);
  console.log(requestsWithMetadata);

  return (
    <div>
      <NotificationSectionHeader />
      <ListContainer>
        {requestsWithMetadata.map(
          ({ request, userDisplayName, questionDisplayName }) => {
            return (
              <RequestNotificationCard
                key={request.id}
                request={request}
                userDisplayName={userDisplayName}
                questionDisplayName={questionDisplayName}
              />
            );
          },
        )}
      </ListContainer>
    </div>
  );
}

const getQuestions = createSelector(
  [getMetadata, (state, ownProps) => ownProps.questions],
  (metadata, questions) =>
    questions && questions.map(card => new Question(card, metadata)),
);

export default _.compose(
  User.loadList(),
  Questions.loadList({ query: { f: "all" } }),
  connect((state, ownProps) => ({
    questions: getQuestions(state, ownProps),
  })),
)(RequestNotifications);
