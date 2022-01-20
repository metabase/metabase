import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { isItemVerified } from "metabase-enterprise/moderation/service";

import { Container, VerifyButton } from "./ModerationActions.styled";

export default ModerationActions;

ModerationActions.propTypes = {
  className: PropTypes.string,
  onVerify: PropTypes.func,
  moderationReview: PropTypes.object,
  isDataset: PropTypes.bool,
};

function ModerationActions({
  moderationReview,
  className,
  onVerify,
  isDataset,
}) {
  const isVerified = isItemVerified(moderationReview);
  const hasActions = !!onVerify;

  const buttonTitle = isDataset
    ? t`Verify this model`
    : t`Verify this question`;

  return hasActions ? (
    <Container className={className}>
      {!isVerified && (
        <VerifyButton data-testid="moderation-verify-action" onClick={onVerify}>
          {buttonTitle}
        </VerifyButton>
      )}
    </Container>
  ) : null;
}
