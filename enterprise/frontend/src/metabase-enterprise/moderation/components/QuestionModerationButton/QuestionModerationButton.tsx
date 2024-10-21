import * as React from "react";
import { t } from "ttag";

import { useEditItemVerificationMutation } from "metabase/api";
import {
  MODERATION_STATUS,
  getLatestModerationReview,
  getStatusIcon,
  isItemVerified,
} from "metabase-enterprise/moderation/service";
import type Question from "metabase-lib/v1/Question";
import { entityIsDashboard, type Dashboard } from "metabase-types/api";

import { getVerifyQuestionTitle } from "../../utils";
import { VerifyButton as DefaultVerifyButton } from "../QuestionModerationSection/QuestionModerationSection.styled";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

interface Props {
  question: Question | Dashboard;
  verifyCard: (id: number) => void;
  removeCardReview: (id: number) => void;
  isModerator: boolean;
  VerifyButton: React.FC;
  verifyButtonProps: any;
}

const { name: verifiedIconName } = getStatusIcon(MODERATION_STATUS.verified);

export function QuestionModerationButton({
  question,
  VerifyButton = DefaultVerifyButton,
  verifyButtonProps = {},
}: Props) {
  const isModerator = useSelector(getUserIsAdmin);
  const [editItemVerification] = useEditItemVerificationMutation();

  const isDashboard = entityIsDashboard(question);

  const { moderated_item_id, moderated_item_type } = React.useMemo(() => {
    return {
      moderated_item_type: isDashboard
        ? ("dashboard" as const)
        : ("card" as const),
      moderated_item_id: isDashboard ? (question.id as number) : question.id(),
    };
  }, [isDashboard, question]);

  const latestModerationReview = getLatestModerationReview(
    isDashboard ? question.moderation_reviews : question.getModerationReviews(),
  );
  const isVerified = isItemVerified(latestModerationReview);

  const onVerify = () => {
    editItemVerification({
      status: "verified",
      moderated_item_id,
      moderated_item_type,
    });
  };

  const onRemoveModerationReview = () => {
    editItemVerification({
      status: null,
      moderated_item_id,
      moderated_item_type,
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
