import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { withRouter } from "react-router";
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
import { ModerationRequestApi } from "metabase/services";
RequestNotifications.propTypes = {
  questions: PropTypes.array,
  users: PropTypes.array,
  router: PropTypes.object.isRequired,
};

function RequestNotifications({ questions, users, router }) {
  const [requests, setRequests] = useState([]);

  const queryParams = router.location.query;
  const statuses = queryParams.status
    ? queryParams.status.split(",")
    : ["open", "closed", "resolved"];

  const usersById = _.indexBy(users, "id");
  const questionsById = _.indexBy(questions, question => question.id());

  useEffect(() => {
    ModerationRequestApi.get().then(requests => {
      setRequests(requests || []);
    });
  }, []);

  const requestsWithMetadata = requests
    .filter(
      request =>
        statuses.includes(request.status) &&
        request.moderated_item_type === "card" &&
        questionsById[request.moderated_item_id],
    )
    .map(request => {
      // will need to account for dashboards soon
      const question = questionsById[request.moderated_item_id];
      const questionDisplayName = question.displayName();
      const user = usersById[request.requester_id];
      const userDisplayName = user ? user.common_name : t`Someone`;
      return {
        request,
        userDisplayName,
        questionDisplayName,
        url: `/question/${question.id()}`,
      };
    });

  return (
    <div>
      <NotificationSectionHeader />
      <ListContainer>
        {requestsWithMetadata.map(
          ({ request, userDisplayName, questionDisplayName, url }) => {
            return (
              <RequestNotificationCard
                key={request.id}
                request={request}
                userDisplayName={userDisplayName}
                questionDisplayName={questionDisplayName}
                url={url}
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
  withRouter,
)(RequestNotifications);
