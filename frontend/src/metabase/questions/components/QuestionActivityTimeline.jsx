import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";
import cx from "classnames";

import { revertToRevision } from "metabase/query_builder/actions";
import { getRevisionEvents } from "metabase/lib/revisions";
import User from "metabase/entities/users";
import Revision from "metabase/entities/revisions";
import { PLUGIN_MODERATION_SERVICE } from "metabase/plugins";
import Timeline from "metabase/components/Timeline";
import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/components/Button";

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
  const events = [
    ...getModerationEvents(question, usersById),
    ...getRevisionEvents(revisions, canWrite),
  ];

  return (
    <div className={className}>
      <div className="text-medium text-bold pb2">{t`Activity`}</div>
      <Timeline
        items={events}
        renderFooter={item => {
          const { showFooter, request, requestStatusText, revision } = item;
          if (request && showFooter) {
            return (
              <ModerationRequestEventFooter
                request={request}
                statusText={requestStatusText}
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
    <div className="py1">
      <Button
        className={cx(
          "p0 borderless text-underline-hover bg-transparent-hover",
          isRequestOpen(request)
            ? "text-dark text-dark-hover"
            : "text-light text-light-hover",
        )}
        onClick={() => onRequestClick(request)}
      >
        {statusText}
      </Button>
    </div>
  );
}

RevisionEventFooter.propTypes = {
  revision: PropTypes.object.isRequired,
  onRevisionClick: PropTypes.func.isRequired,
};

function RevisionEventFooter({ revision, onRevisionClick }) {
  return (
    <div className="py1">
      <ActionButton
        actionFn={() => onRevisionClick(revision)}
        className="p0 borderless text-accent3 text-accent3-hover text-underline-hover bg-transparent-hover"
        successClassName=""
        failedClassName=""
        normalText={t`Revert back`}
        activeText={t`Reverting…`}
        failedText={t`Revert failed`}
        successText={t`Reverted`}
      />
    </div>
  );
}
