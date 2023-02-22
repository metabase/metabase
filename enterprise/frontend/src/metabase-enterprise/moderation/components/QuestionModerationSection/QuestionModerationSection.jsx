import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { getLatestModerationReview } from "metabase-enterprise/moderation/service";
import { getIsModerator } from "metabase-enterprise/moderation/selectors";
import {
  verifyCard,
  removeCardReview,
} from "metabase-enterprise/moderation/actions";

import ModerationReviewBanner from "../ModerationReviewBanner/ModerationReviewBanner";
import { VerifyButton as DefaultVerifyButton } from "./QuestionModerationSection.styled";

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

QuestionModerationSection.VerifyButton = DefaultVerifyButton;

QuestionModerationSection.propTypes = {
  question: PropTypes.object.isRequired,
  verifyCard: PropTypes.func.isRequired,
  removeCardReview: PropTypes.func.isRequired,
  isModerator: PropTypes.bool.isRequired,
  reviewBannerClassName: PropTypes.string,
  VerifyButton: PropTypes.func,
};

function QuestionModerationSection({
  question,
  removeCardReview,
  isModerator,
  reviewBannerClassName,
}) {
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );

  const onRemoveModerationReview = () => {
    const id = question.id();
    removeCardReview(id);
  };

  return (
    <React.Fragment>
      {latestModerationReview && (
        <ModerationReviewBanner
          className={reviewBannerClassName}
          moderationReview={latestModerationReview}
          onRemove={isModerator ? onRemoveModerationReview : undefined}
        />
      )}
    </React.Fragment>
  );
}
