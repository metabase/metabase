import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { withRouter } from "react-router";
import _ from "underscore";
import { t } from "ttag";

import { useAsyncFunction } from "metabase/lib/hooks";
import Questions from "metabase/entities/questions";
import User from "metabase/entities/users";

import {
  getRequestStatuses,
  buildModerationRequestPath,
} from "metabase-enterprise/moderation";

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

  const includedStatuses = getIncludedStatuses(router.location.query);
  const usersById = _.indexBy(users, "id");
  const questionsById = _.indexBy(questions, question => question.id);

  const [fetchModerationRequests] = useAsyncFunction(ModerationRequestApi.get);

  useEffect(() => {
    fetchModerationRequests().then(requests => {
      setRequests(requests || []);
    });
  }, [fetchModerationRequests]);

  const requestsWithMetadata = requests
    .filter(request => {
      // will need to account for dashboards soon
      const isCard = request.moderated_item_type === "card";
      const mapsToExistingCard = !!questionsById[request.moderated_item_id];
      return (
        isCard &&
        mapsToExistingCard &&
        includedStatuses.includes(request.status)
      );
    })
    .map(request => {
      const question = questionsById[request.moderated_item_id];
      const questionDisplayName = question.name;
      const user = usersById[request.requester_id];
      const userDisplayName = user ? user.common_name : t`Someone`;

      return {
        request,
        userDisplayName,
        questionDisplayName,
        url: buildModerationRequestPath(request, question),
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

function getIncludedStatuses(query) {
  const statuses = query.status
    ? query.status.split(",")
    : getRequestStatuses();

  return statuses;
}

export default _.compose(
  User.loadList(),
  Questions.loadList(),
  withRouter,
)(RequestNotifications);
