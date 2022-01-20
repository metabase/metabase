import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import {
  isItemVerified,
  MODERATION_STATUS,
  getStatusIcon,
} from "metabase-enterprise/moderation/service";

import { Container, VerifyButton } from "./ModerationActions.styled";

export default ModerationActions;

ModerationActions.propTypes = {
  className: PropTypes.string,
  onVerify: PropTypes.func,
  moderationReview: PropTypes.object,
  isDataset: PropTypes.bool,
  renderActions: PropTypes.func,
};

function defaultRender({ className, isVerified, onVerify, testID }) {
  return (
    <Container className={className}>
      {!isVerified && (
        <VerifyButton data-testid={testID} onClick={onVerify}>
          {t`Verify this question`}
        </VerifyButton>
      )}
    </Container>
  );
}

function ModerationActions({
  moderationReview,
  className,
  onVerify,
  renderActions = defaultRender,
}) {
  const isVerified = isItemVerified(moderationReview);
  const hasActions = !!onVerify;

  if (!hasActions) {
    return null;
  }

  const { name: verifiedIconName } = getStatusIcon(MODERATION_STATUS.verified);

  return renderActions({
    className,
    isVerified,
    onVerify,
    verifiedIconName,
    testID: "moderation-verify-action",
  });
}
