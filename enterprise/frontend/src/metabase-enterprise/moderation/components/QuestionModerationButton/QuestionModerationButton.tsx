import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

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

import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import { VerifyButton as DefaultVerifyButton } from "../QuestionModerationSection/QuestionModerationSection.styled";

interface Props {
  question: Question;
  verifyCard: (id: number) => void;
  removeCardReview: (id: number) => void;
  isModerator: boolean;
  VerifyButton: React.FC;
  verifyButtonProps: any;
}

const mapStateToProps = (state: State, props: Props) => ({
  isModerator: getIsModerator(state, props),
});

const mapDispatchToProps = {
  verifyCard,
  removeCardReview,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(QuestionModerationButton);

const { name: verifiedIconName } = getStatusIcon(MODERATION_STATUS.verified);

function QuestionModerationButton({
  question,
  verifyCard,
  removeCardReview,
  isModerator,
  VerifyButton = DefaultVerifyButton,
  verifyButtonProps = {},
}: Props) {
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
          onClick={onVerify}
          data-testid="moderation-verify-action"
          {...verifyButtonProps}
        >
          {question.isDataset()
            ? t`Verify this model`
            : t`Verify this question`}
        </VerifyButton>
      )}
      {isModerator && isVerified && (
        <VerifyButton
          icon="close"
          onClick={isModerator && onRemoveModerationReview}
          data-testid="moderation-remove-verification-action"
          {...verifyButtonProps}
        >
          {t`Remove verification`}
        </VerifyButton>
      )}
    </React.Fragment>
  );
}
