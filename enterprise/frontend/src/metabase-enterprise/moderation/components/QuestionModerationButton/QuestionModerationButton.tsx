import * as React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { useEditItemVerificationMutation } from "metabase/api";
import { getIsModerator } from "metabase-enterprise/moderation/selectors";
import {
  MODERATION_STATUS,
  getLatestModerationReview,
  getStatusIcon,
  isItemVerified,
} from "metabase-enterprise/moderation/service";
import type Question from "metabase-lib/v1/Question";
import type { State } from "metabase-types/store";

import { getVerifyQuestionTitle } from "../../utils";
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(QuestionModerationButton);

const { name: verifiedIconName } = getStatusIcon(MODERATION_STATUS.verified);

function QuestionModerationButton({
  question,
  isModerator,
  VerifyButton = DefaultVerifyButton,
  verifyButtonProps = {},
}: Props) {
  const [editItemVerification] = useEditItemVerificationMutation();
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );
  const isVerified = isItemVerified(latestModerationReview);

  const onVerify = () => {
    const id = question.id();
    editItemVerification({
      status: "verified",
      moderated_item_id: id,
      moderated_item_type: "card",
    });
  };

  const onRemoveModerationReview = () => {
    const id = question.id();
    editItemVerification({
      status: null,
      moderated_item_id: id,
      moderated_item_type: "card",
    });
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
          {getVerifyQuestionTitle(question)}
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
