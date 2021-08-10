import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { PLUGIN_MODERATION } from "metabase/plugins";
import { getRevisionEventsForTimeline } from "metabase/lib/revisions";
import { revertToRevision } from "metabase/query_builder/actions";
import { getUser } from "metabase/selectors/user";

import Revision from "metabase/entities/revisions";
import User from "metabase/entities/users";
import Timeline from "metabase/components/Timeline";
import DrawerSection from "metabase/components/DrawerSection/DrawerSection";
import {
  SidebarSectionHeader,
  RevertButton,
} from "./QuestionActivityTimeline.styled";

const { getModerationTimelineEvents } = PLUGIN_MODERATION;

const mapStateToProps = (state, props) => ({
  currentUser: getUser(state),
});

export default _.compose(
  User.loadList({
    loadingAndErrorWrapper: false,
  }),
  Revision.loadList({
    query: (state, props) => ({
      model_type: "card",
      model_id: props.question.id(),
    }),
    wrapped: true,
  }),
  connect(
    mapStateToProps,
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
  users: PropTypes.array,
  currentUser: PropTypes.object.isRequired,
  revertToRevision: PropTypes.func.isRequired,
};

export function QuestionActivityTimeline({
  question,
  className,
  revisions,
  users,
  currentUser,
  revertToRevision,
}) {
  const usersById = useMemo(() => _.indexBy(users, "id"), [users]);
  const canWrite = question.canWrite();
  const moderationReviews = question.getModerationReviews();

  const events = useMemo(() => {
    const moderationEvents = getModerationTimelineEvents(
      moderationReviews,
      usersById,
      currentUser,
    );
    const revisionEvents = getRevisionEventsForTimeline(revisions, canWrite);
    return [...revisionEvents, ...moderationEvents];
  }, [canWrite, moderationReviews, revisions, usersById, currentUser]);

  return (
    <DrawerSection header={t`History`} className={className}>
      <Timeline
        items={events}
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
    </DrawerSection>
  );
}
