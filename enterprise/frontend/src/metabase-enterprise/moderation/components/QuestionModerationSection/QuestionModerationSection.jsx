import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { getLatestModerationReview } from "metabase-enterprise/moderation/service";
import { getIsModerator } from "metabase-enterprise/moderation/selectors";
import {
  verifyCard,
  removeCardReview,
} from "metabase-enterprise/moderation/actions";

import ModerationActions from "../ModerationActions/ModerationActions";
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
  renderActions: PropTypes.func,
  reviewBannerClassName: PropTypes.string,
};

function QuestionModerationSection({
  question,
  verifyCard,
  removeCardReview,
  isModerator,
  renderActions,
  reviewBannerClassName,
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
      <ModerationActions
        moderationReview={latestModerationReview}
        onVerify={isModerator && onVerify}
        renderActions={renderActions}
      />
      {latestModerationReview && (
        <ModerationReviewBanner
          className={reviewBannerClassName}
          moderationReview={latestModerationReview}
          onRemove={isModerator && onRemoveModerationReview}
        />
      )}
    </React.Fragment>
  );
}
