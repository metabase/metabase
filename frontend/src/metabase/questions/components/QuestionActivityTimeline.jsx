import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { revertToRevision } from "metabase/query_builder/actions";
import { getRevisionEvents } from "metabase/lib/revisions";
import User from "metabase/entities/users";
import Revision from "metabase/entities/revisions";
import { PLUGIN_MODERATION_SERVICE } from "metabase/plugins";
import Timeline from "metabase/components/Timeline";
import {
  SidebarSectionHeader,
  RequestButton,
  RevertButton,
} from "./QuestionActivityTimeline.styled";

const { getModerationEvents, isRequestOpen } = PLUGIN_MODERATION_SERVICE;

QuestionActivityTimeline.propTypes = {
  question: PropTypes.object,
  className: PropTypes.string,
  revisions: PropTypes.array,
  revertToRevision: PropTypes.func.isRequired,
  onRequestClick: PropTypes.func.isRequired,
  users: PropTypes.array,
};

function QuestionActivityTimeline({
  question,
  className,
  revisions,
  revertToRevision,
  onRequestClick,
  users,
}) {
  const usersById = _.indexBy(users, "id");
  const canWrite = question.canWrite();

  const moderationEvents =
    getModerationEvents(
      question.getModerationRequests(),
      question.getModerationReviews(),
      usersById,
    ) || [];
  const revisionEvents = getRevisionEvents(revisions, canWrite) || [];
  const events = [...moderationEvents, ...revisionEvents];

  return (
    <div className={className}>
      <SidebarSectionHeader>{t`Activity`}</SidebarSectionHeader>
      <Timeline
        items={events}
        renderFooter={item => {
          const { showFooter, request, footerText, revision } = item;
          if (request && showFooter) {
            return (
              <ModerationRequestEventFooter
                request={request}
                statusText={footerText}
                onRequestClick={onRequestClick}
              />
            );
          } else if (revision && showFooter) {
            return (
              <RevisionEventFooter
                revision={revision}
                onRevisionClick={revertToRevision}
              />
            );
          }
        }}
      />
    </div>
  );
}

export default _.compose(
  User.loadList(),
  Revision.loadList({
    query: (state, props) => ({
      model_type: "card",
      model_id: props.question.id(),
    }),
    wrapped: true,
  }),
  connect(
    null,
    {
      revertToRevision,
    },
  ),
)(QuestionActivityTimeline);

ModerationRequestEventFooter.propTypes = {
  request: PropTypes.object.isRequired,
  statusText: PropTypes.string.isRequired,
  onRequestClick: PropTypes.func.isRequired,
};

function ModerationRequestEventFooter({ request, statusText, onRequestClick }) {
  return (
    <div>
      <RequestButton
        color={isRequestOpen(request) ? "text-dark" : "text-light"}
        onClick={() => onRequestClick(request)}
      >
        {statusText}
      </RequestButton>
    </div>
  );
}

RevisionEventFooter.propTypes = {
  revision: PropTypes.object.isRequired,
  onRevisionClick: PropTypes.func.isRequired,
};

function RevisionEventFooter({ revision, onRevisionClick }) {
  return (
    <div>
      <RevertButton
        actionFn={() => onRevisionClick(revision)}
        normalText={t`Revert back`}
        activeText={t`Reverting…`}
        failedText={t`Revert failed`}
        successText={t`Reverted`}
      />
    </div>
  );
}
