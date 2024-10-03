import PropTypes from "prop-types";
import { Fragment } from "react";
import { connect } from "react-redux";

import { useEditItemVerificationMutation } from "metabase/api";
import { getIsModerator } from "metabase-enterprise/moderation/selectors";
import { getLatestModerationReview } from "metabase-enterprise/moderation/service";

import { ModerationReviewBanner } from "../ModerationReviewBanner/ModerationReviewBanner";

import { VerifyButton as DefaultVerifyButton } from "./QuestionModerationSection.styled";

const mapStateToProps = (state, props) => ({
  isModerator: getIsModerator(state, props),
});

export default connect(mapStateToProps)(QuestionModerationSection);

QuestionModerationSection.VerifyButton = DefaultVerifyButton;

QuestionModerationSection.propTypes = {
  question: PropTypes.object.isRequired,
  isModerator: PropTypes.bool.isRequired,
  reviewBannerClassName: PropTypes.string,
  VerifyButton: PropTypes.func,
};

function QuestionModerationSection({
  question,
  isModerator,
  reviewBannerClassName,
}) {
  const [editItemVerification] = useEditItemVerificationMutation();

  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );

  const onRemoveModerationReview = () => {
    const id = question.id();
    editItemVerification({
      status: null,
      moderated_item_id: id,
      moderated_item_type: "card",
    });
  };

  return (
    <Fragment>
      {latestModerationReview && (
        <ModerationReviewBanner
          className={reviewBannerClassName}
          moderationReview={latestModerationReview}
          onRemove={isModerator ? onRemoveModerationReview : undefined}
        />
      )}
    </Fragment>
  );
}
