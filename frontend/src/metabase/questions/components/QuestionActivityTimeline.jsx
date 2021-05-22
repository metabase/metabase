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
import ActionButton from "metabase/components/ActionButton";

const { getModerationEvents } = PLUGIN_MODERATION_SERVICE;

QuestionActivityTimeline.propTypes = {
  question: PropTypes.object,
  className: PropTypes.string,
  revisions: PropTypes.array,
  revertToRevision: PropTypes.func.isRequired,
  users: PropTypes.array,
};

function QuestionActivityTimeline({
  question,
  className,
  revisions,
  revertToRevision,
  users,
}) {
  const usersById = _.indexBy(users, "id");
  const events = [
    ...getModerationEvents(question, usersById),
    ...getRevisionEvents(revisions),
  ];

  return (
    <div className={className}>
      <div className="text-medium text-bold pb2">{t`Activity`}</div>
      <Timeline
        items={events}
        renderFooter={item =>
          renderQuestionActivityTimelineFooter(item, revertToRevision)
        }
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
    () => {
      return {
        revertToRevision,
      };
    },
  ),
)(QuestionActivityTimeline);

// this looks ugly, so not showing it for now
function renderQuestionActivityTimelineFooter(item, revertToRevision) {
  if (item.showFooter) {
    return (
      <div className="py1 flex justify-end">
        <ActionButton
          actionFn={() => revertToRevision(item.revision)}
          className="Button-borderless text-error"
          normalText={t`Revert`}
          activeText={t`Reverting…`}
          failedText={t`Revert failed`}
          successText={t`Reverted`}
        />
      </div>
    );
  }
}
