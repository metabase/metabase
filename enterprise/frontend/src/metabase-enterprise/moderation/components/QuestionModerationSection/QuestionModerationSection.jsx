import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { getLatestModerationReview } from "metabase-enterprise/moderation/service";
import { getIsModerator } from "metabase-enterprise/moderation/selectors";
import {
  verifyCard,
  removeCardReview,
} from "metabase-enterprise/moderation/actions";

import { BorderedModerationActions } from "./QuestionModerationSection.styled";
import ModerationReviewBanner from "../ModerationReviewBanner/ModerationReviewBanner";

const mapStateToProps = (state, props) => ({
  isModerator: getIsModerator(state, props),
});
const mapDispatchToProps = {
  verifyCard,
  removeCardReview,
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(QuestionModerationSection);

QuestionModerationSection.propTypes = {
  question: PropTypes.object.isRequired,
  verifyCard: PropTypes.func.isRequired,
  removeCardReview: PropTypes.func.isRequired,
  isModerator: PropTypes.bool.isRequired,
};

function QuestionModerationSection({
  question,
  verifyCard,
  removeCardReview,
  isModerator,
}) {
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );

  const onVerify = () => {
    const id = question.id();
    verifyCard(id);
  };

  const onRemoveModerationReview = () => {
    const id = question.id();
    removeCardReview(id);
  };

  return (
    <React.Fragment>
      <BorderedModerationActions
        moderationReview={latestModerationReview}
        onVerify={isModerator && onVerify}
      />
      {latestModerationReview && (
        <ModerationReviewBanner
          moderationReview={latestModerationReview}
          onRemove={isModerator && onRemoveModerationReview}
        />
      )}
    </React.Fragment>
  );
}
