import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { revertToRevision } from "metabase/query_builder/actions";
import { getRevisionDescription } from "metabase/lib/revisions";

import Revision from "metabase/entities/revisions";
import Timeline from "metabase/components/Timeline";
import ActionButton from "metabase/components/ActionButton";

QuestionActivityTimeline.propTypes = {
  question: PropTypes.object,
  className: PropTypes.string,
  revisions: PropTypes.array,
  revertToRevision: PropTypes.func.isRequired,
};

function QuestionActivityTimeline({
  question,
  className,
  revisions,
  revertToRevision,
}) {
  const events = revisions.map((revision, index) => {
    // const canRevert = question.canWrite();
    return {
      timestamp: revision.timestamp,
      icon: "pencil",
      title: t`${revision.user.common_name} edited this`,
      description: getRevisionDescription(revision),
      // showFooter: index !== 0 && canRevert,
      showFooter: false,
      revision,
    };
  });

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
