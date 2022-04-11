import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import { color } from "metabase/lib/colors";

import {
  MODERATION_STATUS,
  getLatestModerationReview,
  getStatusIcon,
  isItemVerified,
} from "metabase-enterprise/moderation/service";
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

const { name: verifiedIconName, color: verifiedIconColor } = getStatusIcon(
  MODERATION_STATUS.verified,
);

function QuestionModerationSection({
  question,
  verifyCard,
  removeCardReview,
  isModerator,
  reviewBannerClassName,
  VerifyButton = DefaultVerifyButton,
}) {
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );
  const isVerified = isItemVerified(latestModerationReview);

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
      {isModerator && !isVerified && (
        <VerifyButton
          icon={verifiedIconName}
          iconColor={color(verifiedIconColor)}
          onClick={onVerify}
          data-testid="moderation-verify-action"
        >
          {question.isDataset()
            ? t`Verify this model`
            : t`Verify this question`}
        </VerifyButton>
      )}
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
