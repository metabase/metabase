import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { getRevisionEventsForTimeline } from "metabase/lib/revisions";
import { revertToRevision } from "metabase/query_builder/actions";

import Revision from "metabase/entities/revisions";
import Timeline from "metabase/components/Timeline";
import {
  SidebarSectionHeader,
  RevertButton,
} from "./QuestionActivityTimeline.styled";

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
    {
      revertToRevision,
    },
  ),
)(QuestionActivityTimeline);

RevisionEventFooter.propTypes = {
  revision: PropTypes.object.isRequired,
  onRevisionClick: PropTypes.func.isRequired,
};

function RevisionEventFooter({ revision, onRevisionClick }) {
  return (
    <div>
      <RevertButton
        actionFn={() => onRevisionClick(revision)}
        normalText={t`Revert`}
        activeText={t`Reverting…`}
        failedText={t`Revert failed`}
        successText={t`Reverted`}
      />
    </div>
  );
}

QuestionActivityTimeline.propTypes = {
  question: PropTypes.object.isRequired,
  className: PropTypes.string,
  revisions: PropTypes.array,
  revertToRevision: PropTypes.func.isRequired,
};

export function QuestionActivityTimeline({
  question,
  className,
  revisions,
  revertToRevision,
}) {
  const canWrite = question.canWrite();
  const revisionEvents = getRevisionEventsForTimeline(revisions, canWrite);

  return (
    <div className={className}>
      <SidebarSectionHeader>{t`History`}</SidebarSectionHeader>
      <Timeline
        items={revisionEvents}
        renderFooter={item => {
          const { isRevertable, revision } = item;
          if (isRevertable) {
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
